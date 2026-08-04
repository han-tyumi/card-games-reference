/**
 * Does a deploy actually reach a reader?
 *
 *   npm install --no-save playwright
 *   npm run update-notice
 *
 * Run by hand, not by the build. The rule this checks lives in the browser --
 * a service worker taking over, and a page noticing -- so there is no DOM-free
 * way to assert it, and `npm run check` deliberately does not depend on a
 * browser (see build-og.ts for why, and the filters design document for the
 * three `app.js` behaviours in the same position).
 *
 * Two paths, and they are not the same path:
 *
 *   A. the tab was left open and comes back into view, which is what
 *      `visibilitychange -> registration.update()` in page() exists for.
 *   B. the reader navigates to the site after a deploy. The navigation is
 *      served cache-first from the OLD cache, so they get the previous version
 *      and the notice is the only thing that tells them.
 *
 * A deploy is simulated the way a deploy actually looks: changed bytes AND a
 * changed CACHE constant, which is what makes the browser adopt a new worker.
 *
 * **Every wait here is a wait for a condition, never a sleep.** The first
 * version of this slept 2500ms, the controller change landed at 2594ms, and it
 * reported that the update notice was broken. It was not; the harness was. A
 * timeout that fails loudly is a measurement, a sleep that passes is a guess.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const DOCS = fileURLToPath(new URL("../../docs", import.meta.url));
const ROOT = join(tmpdir(), "naibi-update-notice");
const PORT = 8199;
const ORIGIN = `http://127.0.0.1:${PORT}`;

/** Set when a preinstalled browser should be used rather than a downloaded one. */
const EXECUTABLE = process.env["CHROMIUM_PATH"];

type Page = {
  goto(url: string): Promise<unknown>;
  click(selector: string): Promise<unknown>;
  evaluate<T>(fn: () => T): Promise<T>;
  waitForFunction(fn: () => boolean, arg: null, options: { timeout: number }): Promise<unknown>;
};
type Context = { newPage(): Promise<Page>; close(): Promise<void> };
type Browser = {
  newContext(): Promise<Context>;
  close(): Promise<void>;
};
type Playwright = {
  chromium: { launch(options?: { args?: string[]; executablePath?: string }): Promise<Browser> };
};

// Typed as `string` so the type-checker cannot resolve it, exactly as in
// build-og.ts -- playwright must not be needed for `npm run typecheck`.
const PACKAGE: string = "playwright";

/*
 * The callbacks passed to page.evaluate() run in the BROWSER, not here, so they
 * reach for globals this file's lib does not have. Declared narrowly rather
 * than by adding "dom" to tsconfig.json: that config withholds `document` and
 * `window` from every Node script on purpose, because reaching for them there
 * is a mistake worth catching (see the note in tsconfig.web.json). Exactly the
 * shape these four callbacks use, and nothing else.
 */
declare const document: {
  getElementById(id: string): { hidden: boolean } | null;
  querySelector(selector: string): { textContent: string | null } | null;
  dispatchEvent(event: object): boolean;
};
declare const navigator: { serviceWorker: { controller: object | null } };
declare const Event: new (type: string) => object;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

/** What the reader is looking at, and what is serving it to them. */
type Seen = { heading: string; banner: boolean | null; controlled: boolean };

const failures: string[] = [];
const record = (ok: boolean, what: string, detail: string): void => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what.padEnd(46)} ${detail}`);
  if (!ok) failures.push(what);
};

async function main(): Promise<number> {
  let chromium: Playwright["chromium"];
  try {
    ({ chromium } = (await import(PACKAGE)) as Playwright);
  } catch {
    console.error(
      "playwright is not installed, so the update notice cannot be checked.\n" +
        "  npm install --no-save playwright",
    );
    return 1;
  }

  if (!existsSync(join(DOCS, "sw.js"))) {
    console.error(`No worker at ${DOCS}/sw.js -- run \`npm run web\` first.`);
    return 1;
  }

  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });
  cpSync(DOCS, ROOT, { recursive: true });

  const swPath = join(ROOT, "sw.js");
  const indexPath = join(ROOT, "index.html");
  const workerA = readFileSync(swPath, "utf8");
  const indexA = readFileSync(indexPath, "utf8");

  if (!indexA.includes("<h1>")) {
    console.error("The index has no <h1> to tell two builds apart by.");
    return 1;
  }

  /** A deploy: new bytes on the page and a new cache name, as build-web emits. */
  const deploy = (build: "A" | "B"): void => {
    writeFileSync(
      swPath,
      build === "A" ? workerA : workerA.replace(/const CACHE = "[^"]+"/, `const CACHE = "naibi-B"`),
    );
    writeFileSync(
      indexPath,
      build === "A" ? indexA : indexA.replace(/<h1>([^<]*)<\/h1>/, "<h1>$1 BUILD-B</h1>"),
    );
  };

  const server = createServer((req, res) => {
    let file = join(ROOT, decodeURIComponent(new URL(req.url ?? "/", ORIGIN).pathname));
    if (!file.startsWith(ROOT)) return void res.writeHead(403).end();
    if (existsSync(file) && !extname(file)) file = join(file, "index.html");
    if (!existsSync(file)) return void res.writeHead(404).end("404");
    // No HTTP caching, so Cache Storage is the only cache being measured.
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", resolve));

  const browser = await chromium.launch(
    EXECUTABLE && existsSync(EXECUTABLE)
      ? { args: ["--no-sandbox"], executablePath: EXECUTABLE }
      : { args: ["--no-sandbox"] },
  );

  const look = (page: Page): Promise<Seen> =>
    page.evaluate(() => {
      const banner = document.getElementById("updated");
      return {
        heading: document.querySelector("h1")?.textContent?.trim() ?? "(none)",
        banner: banner ? !banner.hidden : null,
        controlled: !!navigator.serviceWorker.controller,
      };
    });

  /** Waits for the condition, and throws rather than passing quietly. */
  const until = async (page: Page, fn: () => boolean, what: string): Promise<boolean> => {
    try {
      await page.waitForFunction(fn, null, { timeout: 20000 });
      return true;
    } catch {
      console.log(`        (timed out waiting for ${what})`);
      return false;
    }
  };
  const controlled = (page: Page): Promise<boolean> =>
    until(page, () => !!navigator.serviceWorker.controller, "a controller");
  const bannered = (page: Page): Promise<boolean> =>
    until(
      page,
      () => {
        const el = document.getElementById("updated");
        return !!el && !el.hidden;
      },
      "the update notice",
    );

  try {
    console.log("\nPATH A -- the tab is left open and comes back into view");
    {
      deploy("A");
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${ORIGIN}/`);
      await controlled(page);
      // Load again so the page is controlled from the start, which is what the
      // `updating` guard in page() keys off.
      await page.goto(`${ORIGIN}/`);
      await controlled(page);
      const first = await look(page);
      record(first.banner === false, "a first install raises no notice", `banner=${first.banner}`);

      deploy("B");
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      const told = await bannered(page);
      record(told, "returning to the tab raises the notice", "after a deploy");

      const before = await look(page);
      record(
        !before.heading.includes("BUILD-B"),
        "the page is not yanked out from under the reader",
        `still "${before.heading}"`,
      );

      // Only if the notice appeared. The button lives inside it, so clicking
      // blind waits on a hidden element and throws -- which killed the run
      // before it could print its summary, turning one failure into no report.
      if (told) {
        await page.click("#reload");
        await until(page, () => !!document.querySelector("h1"), "the reloaded page");
        const after = await look(page);
        record(
          after.heading.includes("BUILD-B"),
          "Reload gets the new build",
          `now "${after.heading}"`,
        );
      } else {
        record(false, "Reload gets the new build", "not reachable: no notice to click");
      }
      await context.close();
    }

    console.log("\nPATH B -- the reader navigates to the site after a deploy");
    {
      deploy("A");
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${ORIGIN}/`);
      await controlled(page);

      deploy("B");
      await page.goto(`${ORIGIN}/`);
      const told = await bannered(page);
      const seen = await look(page);
      record(
        told || seen.heading.includes("BUILD-B"),
        "stale content is never served silently",
        told ? "notice shown" : `served "${seen.heading}"`,
      );

      // CONTROL. If the swap never reached the wire, everything above passed
      // for the wrong reason -- the server has to be serving the new build.
      const wire = await fetch(`${ORIGIN}/`, { cache: "no-store" }).then((r) => r.text());
      record(wire.includes("BUILD-B"), "CONTROL: the deploy reached the wire", "server serves B");
      await context.close();
    }

    // CONTROL. A run where the notice can never be seen would report the same
    // "ok" as a working one if this did not fail.
    console.log("\nCONTROL -- can this check see a notice at all?");
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${ORIGIN}/`);
      await page.evaluate(() => {
        const el = document.getElementById("updated");
        if (el) el.hidden = false;
      });
      const forced = await look(page);
      record(forced.banner === true, "CONTROL: a forced notice is seen", `banner=${forced.banner}`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
    rmSync(ROOT, { recursive: true, force: true });
  }

  console.log(
    failures.length === 0
      ? "\nThe update notice reaches the reader on both paths.\n"
      : `\n${failures.length} failed: ${failures.join("; ")}\n`,
  );
  return failures.length === 0 ? 0 : 1;
}

process.exitCode = await main();
