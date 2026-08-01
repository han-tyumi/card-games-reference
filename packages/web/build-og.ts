/**
 * Render the link preview card to a PNG.
 *
 *   npm install --no-save playwright
 *   npm run og
 *
 * Run by hand, not by the build. The card says nothing that changes, so it does
 * not need regenerating when an entry is added -- and this is the one script in
 * the project that needs a browser, which is not a dependency worth putting in
 * the path of `npm run build` or of every CI install.
 *
 * That is why playwright is imported the way it is below: it must not be
 * required to be installed for `npm run typecheck` to pass, so the specifier is
 * hidden from the type-checker and the shape this script uses is declared here
 * instead. Small and exact beats pulling a browser into every `npm ci`.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS = fileURLToPath(new URL("assets", import.meta.url));
const SOURCE = join(ASSETS, "og-card.html");
const OUTPUT = join(ASSETS, "icons", "og.png");

/** Open Graph's recommended size; also what GitHub wants for a social preview. */
const SIZE = { width: 1200, height: 630 };

/** Set when a preinstalled browser should be used rather than a downloaded one. */
const EXECUTABLE = process.env["CHROMIUM_PATH"];

type Page = {
  goto(url: string, options?: { waitUntil?: string }): Promise<unknown>;
  screenshot(options: {
    path: string;
    clip: { x: number; y: number; width: number; height: number };
  }): Promise<unknown>;
};

type Browser = {
  newPage(options?: {
    viewport: { width: number; height: number };
    deviceScaleFactor?: number;
  }): Promise<Page>;
  close(): Promise<void>;
};

type Playwright = {
  chromium: { launch(options?: { executablePath?: string }): Promise<Browser> };
};

// Typed as `string`, not as the literal, so the type-checker cannot resolve the
// module and does not require it to be installed. Deliberate -- see the header.
const PACKAGE: string = "playwright";

async function main(): Promise<number> {
  let chromium: Playwright["chromium"];
  try {
    ({ chromium } = (await import(PACKAGE)) as Playwright);
  } catch {
    console.error(
      "playwright is not installed, so the card cannot be rendered.\n" +
        "  npm install --no-save playwright\n" +
        `The committed ${OUTPUT} is still valid; this only regenerates it.`,
    );
    return 1;
  }

  const browser = await chromium.launch(
    EXECUTABLE && existsSync(EXECUTABLE) ? { executablePath: EXECUTABLE } : {},
  );
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
  await page.goto(`file://${SOURCE}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: OUTPUT, clip: { x: 0, y: 0, ...SIZE } });
  await browser.close();

  console.log(`Wrote ${OUTPUT} (${SIZE.width}x${SIZE.height})`);
  return 0;
}

process.exit(await main());
