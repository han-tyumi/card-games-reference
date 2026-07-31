#!/usr/bin/env python3
"""Compile every game entry into a single printable PDF.

    python3 scripts/build_pdf.py
    python3 scripts/build_pdf.py --output /tmp/rules.pdf

Produces a bookmarked, page-numbered booklet with a contents page and one game
per page. Like rendered/, the PDF is generated output -- edit the JSON, rebuild.
"""

from __future__ import annotations

import argparse
import datetime as dt
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

from gamelib import (
    RENDERED_DIR,
    SECTIONS,
    category_label,
    facts,
    games_by_category,
    load_games,
)

TITLE = "Open Card Game Rules Reference"
SUBTITLE = "Original write-ups of traditional and popular card games"

# Core PDF fonts cannot encode card suit pips, so prefer a TrueType face that can.
FONT_CANDIDATES = [
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf"),
    ("/usr/share/fonts/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
     "/usr/share/fonts/dejavu/DejaVuSans-Oblique.ttf"),
    ("/Library/Fonts/DejaVuSans.ttf",
     "/Library/Fonts/DejaVuSans-Bold.ttf",
     "/Library/Fonts/DejaVuSans-Oblique.ttf"),
]

# Used only when we fall back to a core font that cannot represent these glyphs.
GLYPH_FALLBACKS = {
    "♠": "spades", "♥": "hearts", "♦": "diamonds", "♣": "clubs",
    "♡": "hearts", "♤": "spades", "♢": "diamonds", "♧": "clubs",
    "→": "->", "≤": "<=", "≥": ">=", "×": "x",
}

ACCENT = colors.HexColor("#1f3a5f")
MUTED = colors.HexColor("#5b6672")
RULE = colors.HexColor("#c8d0d8")


def register_fonts() -> tuple[str, str, str]:
    """Return (regular, bold, italic) font names, preferring a Unicode-capable face."""
    for regular, bold, italic in FONT_CANDIDATES:
        if Path(regular).exists() and Path(bold).exists():
            pdfmetrics.registerFont(TTFont("Deja", regular))
            pdfmetrics.registerFont(TTFont("Deja-Bold", bold))
            if Path(italic).exists():
                pdfmetrics.registerFont(TTFont("Deja-Italic", italic))
                pdfmetrics.registerFontFamily(
                    "Deja", normal="Deja", bold="Deja-Bold", italic="Deja-Italic"
                )
                return "Deja", "Deja-Bold", "Deja-Italic"
            pdfmetrics.registerFontFamily("Deja", normal="Deja", bold="Deja-Bold")
            return "Deja", "Deja-Bold", "Deja-Bold"
    return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"


def make_styles(regular: str, bold: str, italic: str) -> dict:
    base = getSampleStyleSheet()["BodyText"]
    return {
        "title": ParagraphStyle(
            "DocTitle", parent=base, fontName=bold, fontSize=30, leading=36,
            textColor=ACCENT, spaceAfter=14,
        ),
        "subtitle": ParagraphStyle(
            "DocSubtitle", parent=base, fontName=regular, fontSize=13, leading=18,
            textColor=MUTED, spaceAfter=8,
        ),
        "colophon": ParagraphStyle(
            "Colophon", parent=base, fontName=regular, fontSize=9.5, leading=15,
            textColor=MUTED,
        ),
        "category": ParagraphStyle(
            "CategoryHeading", parent=base, fontName=bold, fontSize=11, leading=14,
            textColor=MUTED, spaceAfter=2,
        ),
        "game": ParagraphStyle(
            "GameHeading", parent=base, fontName=bold, fontSize=21, leading=25,
            textColor=ACCENT, spaceAfter=10,
        ),
        # Same look as a game heading, but a different style name so it is not
        # picked up as a contents entry or a bookmark.
        "page": ParagraphStyle(
            "PageHeading", parent=base, fontName=bold, fontSize=21, leading=25,
            textColor=ACCENT, spaceAfter=10,
        ),
        "section": ParagraphStyle(
            "SectionHeading", parent=base, fontName=bold, fontSize=11.5, leading=14,
            textColor=ACCENT, spaceBefore=12, spaceAfter=5,
        ),
        "body": ParagraphStyle(
            "Body", parent=base, fontName=regular, fontSize=10, leading=14.5,
            spaceAfter=6,
        ),
        "variant": ParagraphStyle(
            "Variant", parent=base, fontName=regular, fontSize=10, leading=14.5,
            spaceAfter=6, leftIndent=10,
        ),
        "note": ParagraphStyle(
            "Note", parent=base, fontName=italic, fontSize=8.5, leading=12,
            textColor=MUTED, spaceBefore=10,
        ),
        "fact_key": ParagraphStyle(
            "FactKey", parent=base, fontName=bold, fontSize=9, leading=12,
            textColor=MUTED,
        ),
        "fact_value": ParagraphStyle(
            "FactValue", parent=base, fontName=regular, fontSize=9, leading=12,
        ),
        "toc0": ParagraphStyle(
            "Toc0", parent=base, fontName=bold, fontSize=10.5, leading=16,
            textColor=MUTED, spaceBefore=10,
        ),
        "toc1": ParagraphStyle(
            "Toc1", parent=base, fontName=regular, fontSize=10, leading=15,
            leftIndent=16,
        ),
    }


class Booklet(BaseDocTemplate):
    """Adds contents-page entries and PDF bookmarks as headings are laid out."""

    def __init__(self, path: str, regular: str, **kwargs):
        super().__init__(
            path, pagesize=LETTER,
            leftMargin=0.85 * inch, rightMargin=0.85 * inch,
            topMargin=0.8 * inch, bottomMargin=0.85 * inch,
            title=TITLE, author="Open Card Game Rules Reference contributors",
            subject="Card game rules", **kwargs,
        )
        self.regular = regular
        frame = Frame(
            self.leftMargin, self.bottomMargin, self.width, self.height, id="body"
        )
        self.addPageTemplates([
            PageTemplate(id="plain", frames=[frame], onPage=self._decorate)
        ])

    def _decorate(self, canvas, doc):
        if doc.page == 1:
            return
        canvas.saveState()
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.5)
        y = self.bottomMargin - 16
        canvas.line(self.leftMargin, y, self.leftMargin + self.width, y)
        canvas.setFont(self.regular, 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(self.leftMargin, y - 12, TITLE)
        canvas.drawRightString(
            self.leftMargin + self.width, y - 12, str(doc.page)
        )
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if not isinstance(flowable, Paragraph):
            return
        style = flowable.style.name
        if style == "CategoryHeading":
            level, key = 0, f"cat-{flowable.getPlainText()}"
        elif style == "GameHeading":
            level, key = 1, f"game-{flowable.getPlainText()}"
        else:
            return
        text = flowable.getPlainText()
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(text, key, level=level, closed=(level == 0))
        self.notify("TOCEntry", (level, text, self.page, key))


def clean(text: str, unicode_ok: bool) -> str:
    """Escape for reportlab's mini-XML, downgrading glyphs a core font lacks."""
    if not unicode_ok:
        for glyph, replacement in GLYPH_FALLBACKS.items():
            text = text.replace(glyph, replacement)
        text = text.encode("cp1252", "replace").decode("cp1252")
    return escape(text)


def paragraphs(text: str, style, unicode_ok: bool) -> list:
    """Split prose on blank lines.

    A Paragraph collapses newlines into spaces, so entries that use blank lines
    to separate ideas need one flowable each or they run together in the PDF.
    """
    blocks = [block.strip() for block in text.split("\n\n")]
    return [
        Paragraph(clean(block.replace("\n", " "), unicode_ok), style)
        for block in blocks
        if block
    ]


def title_page(styles: dict, game_count: int, unicode_ok: bool) -> list:
    today = dt.date.today().isoformat()
    return [
        Spacer(1, 1.6 * inch),
        Paragraph(clean(TITLE, unicode_ok), styles["title"]),
        Paragraph(clean(SUBTITLE, unicode_ok), styles["subtitle"]),
        Spacer(1, 0.3 * inch),
        Paragraph(
            clean(
                f"{game_count} games for 1 to 8 players, playable with the decks you "
                f"already own.",
                unicode_ok,
            ),
            styles["subtitle"],
        ),
        Spacer(1, 2.2 * inch),
        Paragraph(
            clean(
                "Every entry in this book was written from scratch. Game rules are "
                "facts and belong to everyone; the words used to explain them here "
                "are the project's own, not reproduced from any other rulebook or "
                "website.",
                unicode_ok,
            ),
            styles["colophon"],
        ),
        Spacer(1, 0.15 * inch),
        Paragraph(
            clean(
                f"Text licensed under CC BY-SA 4.0. Scripts licensed under MIT. "
                f"Generated {today}.",
                unicode_ok,
            ),
            styles["colophon"],
        ),
        PageBreak(),
    ]


def contents_page(styles: dict) -> list:
    toc = TableOfContents()
    toc.levelStyles = [styles["toc0"], styles["toc1"]]
    return [Paragraph("Contents", styles["page"]), toc, PageBreak()]


def facts_table(game: dict, styles: dict, width: float, unicode_ok: bool) -> Table:
    rows = [
        [
            Paragraph(clean(key, unicode_ok), styles["fact_key"]),
            Paragraph(clean(value, unicode_ok), styles["fact_value"]),
        ]
        for key, value in facts(game)
    ]
    table = Table(rows, colWidths=[1.15 * inch, width - 1.15 * inch], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, RULE),
    ]))
    return table


def game_flowables(
    game: dict, styles: dict, width: float, unicode_ok: bool, category: str | None
) -> list:
    story: list = []
    if category:
        story.append(Paragraph(clean(category.upper(), unicode_ok), styles["category"]))
    story.append(Paragraph(clean(game["name"], unicode_ok), styles["game"]))
    story.append(facts_table(game, styles, width, unicode_ok))
    story.append(Spacer(1, 6))

    for key, heading in SECTIONS:
        story.append(
            KeepTogether([
                Paragraph(clean(heading, unicode_ok), styles["section"]),
                *paragraphs(game[key], styles["body"], unicode_ok)[:1],
            ])
        )
        story.extend(paragraphs(game[key], styles["body"], unicode_ok)[1:])

    story.append(Paragraph("Variants", styles["section"]))
    for variant in game["variants"]:
        story.append(
            Paragraph(
                f"<b>{clean(variant['name'], unicode_ok)}</b> &mdash; "
                f"{clean(variant['description'].replace(chr(10), ' '), unicode_ok)}",
                styles["variant"],
            )
        )

    story.append(
        Paragraph(
            clean(
                "Rules verified against: "
                + ", ".join(game["sources_consulted"])
                + ". Original text; not reproduced from those sources.",
                unicode_ok,
            ),
            styles["note"],
        )
    )
    story.append(PageBreak())
    return story


def build(output: Path) -> int:
    games = load_games()
    if not games:
        raise SystemExit("No games found. Nothing to build.")

    regular, bold, italic = register_fonts()
    unicode_ok = regular != "Helvetica"
    styles = make_styles(regular, bold, italic)

    output.parent.mkdir(parents=True, exist_ok=True)
    doc = Booklet(str(output), regular)

    story = title_page(styles, len(games), unicode_ok)
    story += contents_page(styles)

    for category, entries in games_by_category(games):
        for index, game in enumerate(entries):
            label = category_label(category) if index == 0 else None
            story += game_flowables(game, styles, doc.width, unicode_ok, label)

    # Two passes so the contents page can resolve real page numbers.
    doc.multiBuild(story)

    size_kb = output.stat().st_size / 1024
    print(f"Wrote {output} ({len(games)} games, {size_kb:.0f} KB)")
    if not unicode_ok:
        print("Note: fell back to a core PDF font; suit symbols were spelled out.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=RENDERED_DIR / "card-games-reference.pdf",
        help="where to write the PDF (default: rendered/card-games-reference.pdf)",
    )
    args = parser.parse_args()
    return build(args.output)


if __name__ == "__main__":
    raise SystemExit(main())
