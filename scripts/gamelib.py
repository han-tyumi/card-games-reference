#!/usr/bin/env python3
"""Shared loading and formatting helpers for the render and PDF scripts.

Both generators read the same entries and describe them the same way, so the
Markdown and the PDF stay in sync. Nothing here writes output.
"""

from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
GAMES_DIR = REPO_ROOT / "games"
RENDERED_DIR = REPO_ROOT / "rendered"

# Display labels and the order categories appear in generated output.
CATEGORY_LABELS = {
    "solitaire": "Solitaire (1 player)",
    "trick-taking": "Trick-taking",
    "rummy-type": "Rummy family",
    "shedding": "Shedding",
    "matching-collecting": "Matching & collecting",
    "bluffing": "Bluffing",
    "casino": "Casino",
}

CATEGORY_ORDER = list(CATEGORY_LABELS)

DIFFICULTY_ORDER = ["simple", "easy", "medium", "complex"]

SECTIONS = [
    ("setup", "Setup"),
    ("play", "Play"),
    ("goal_and_scoring", "Goal & scoring"),
]


def load_games() -> list[dict]:
    """Every game entry, sorted by display name."""
    games = []
    for path in sorted(GAMES_DIR.glob("*.json")):
        with path.open(encoding="utf-8") as handle:
            games.append(json.load(handle))
    return sorted(games, key=lambda g: g["name"].casefold())


def games_by_category(games: list[dict]) -> list[tuple[str, list[dict]]]:
    """Games grouped into (category, entries) pairs in display order."""
    grouped = []
    for category in CATEGORY_ORDER:
        entries = [g for g in games if g.get("category") == category]
        if entries:
            grouped.append((category, entries))

    # Anything with an unexpected category still gets rendered rather than dropped.
    known = set(CATEGORY_ORDER)
    leftovers = [g for g in games if g.get("category") not in known]
    if leftovers:
        grouped.append(("other", leftovers))
    return grouped


def category_label(category: str) -> str:
    return CATEGORY_LABELS.get(category, category.replace("-", " ").title())


def players_line(game: dict) -> str:
    """e.g. '3-7 players (best with 4)' or '1 player'."""
    players = game["players"]
    low, high, ideal = players["min"], players["max"], players["ideal"]
    count = f"{low} player" if low == high == 1 else f"{low}-{high} players"
    if low == high and low != 1:
        count = f"{low} players"
    if low == high:
        return count
    return f"{count} (best with {ideal})"


def duration_line(game: dict) -> str:
    value = game["duration_minutes"]
    if value.endswith("+"):
        return f"{value[:-1]}+ minutes"
    return f"{value} minutes"


def facts(game: dict) -> list[tuple[str, str]]:
    """The at-a-glance rows shown above the rules in every output format."""
    rows = [
        ("Players", players_line(game)),
        ("Deck", game["decks"]),
        ("Time", duration_line(game)),
        ("Difficulty", game["difficulty"].title()),
        ("Category", category_label(game["category"])),
    ]
    if game.get("aliases"):
        rows.insert(0, ("Also known as", ", ".join(game["aliases"])))
    return rows
