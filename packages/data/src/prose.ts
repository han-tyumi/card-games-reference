/**
 * Parse the light Markdown convention the prose fields use.
 *
 * Entries are written with blank lines between paragraphs and "- " for bullets,
 * and nothing else -- no headings, no emphasis, no nesting. The Markdown output
 * gets that for free because it *is* Markdown; the PDF and the site both have to
 * interpret it, and they used to interpret it separately. They agree now because
 * there is one parser, here, beside the data it parses.
 *
 * Renderers decide what a paragraph or a list looks like. This only decides
 * which is which.
 */

export type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

/** A bullet marker at the start of a line: "- " or "* ", any trailing space. */
const BULLET = /^[-*]\s+/;

export function blocks(text: string): Block[] {
  const out: Block[] = [];

  for (const chunk of text.split(/\n\s*\n/)) {
    // Soft-wrapped source lines are one paragraph, so they are rejoined with a
    // space. Blank lines are what separate blocks, not newlines.
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) continue;

    // All-or-nothing: a chunk mixing bullets and prose is prose, because
    // guessing where the list starts is how you get a stray bullet mid-sentence.
    if (lines.every((line) => BULLET.test(line))) {
      out.push({ kind: "list", items: lines.map((line) => line.replace(BULLET, "")) });
    } else {
      out.push({ kind: "paragraph", text: lines.join(" ") });
    }
  }

  return out;
}
