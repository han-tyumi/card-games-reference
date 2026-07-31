#!/usr/bin/env python3
"""Validate every game entry in games/ against schema/game.schema.json.

Runs the JSON Schema check plus the cross-file rules a schema cannot express:
filenames matching ids, ids being unique, and player counts being internally
consistent. Exits non-zero if anything fails, so it works as a CI gate.

    python3 scripts/validate.py            # validate everything
    python3 scripts/validate.py --quiet    # only print problems
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from jsonschema import Draft202012Validator
except ImportError:
    sys.exit("jsonschema is not installed. Run: pip install -r requirements.txt")

REPO_ROOT = Path(__file__).resolve().parent.parent
GAMES_DIR = REPO_ROOT / "games"
SCHEMA_PATH = REPO_ROOT / "schema" / "game.schema.json"


def load_schema() -> dict:
    with SCHEMA_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def iter_game_files() -> list[Path]:
    return sorted(GAMES_DIR.glob("*.json"))


def check_entry(path: Path, data: dict, validator: Draft202012Validator) -> list[str]:
    """Return a list of human-readable problems with one entry."""
    problems = []

    for error in sorted(validator.iter_errors(data), key=lambda e: list(e.path)):
        location = "/".join(str(part) for part in error.path) or "(root)"
        problems.append(f"{location}: {error.message}")

    # Cross-checks the schema itself cannot express.
    game_id = data.get("id")
    if isinstance(game_id, str) and game_id != path.stem:
        problems.append(f"id {game_id!r} does not match filename {path.name!r}")

    players = data.get("players")
    if isinstance(players, dict):
        low, high, ideal = players.get("min"), players.get("max"), players.get("ideal")
        if all(isinstance(v, int) for v in (low, high, ideal)):
            if low > high:
                problems.append(f"players.min ({low}) is greater than players.max ({high})")
            if not low <= ideal <= high:
                problems.append(
                    f"players.ideal ({ideal}) is outside the range {low}-{high}"
                )

    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--quiet", action="store_true", help="only print entries that have problems"
    )
    args = parser.parse_args()

    if not GAMES_DIR.is_dir():
        sys.exit(f"No games directory at {GAMES_DIR}")

    validator = Draft202012Validator(load_schema())
    paths = iter_game_files()
    if not paths:
        sys.exit(f"No game files found in {GAMES_DIR}")

    failures = 0
    seen_ids: dict[str, Path] = {}
    seen_names: dict[str, Path] = {}

    for path in paths:
        try:
            with path.open(encoding="utf-8") as handle:
                data = json.load(handle)
        except json.JSONDecodeError as exc:
            print(f"FAIL {path.name}\n  not valid JSON: {exc}")
            failures += 1
            continue

        problems = check_entry(path, data, validator)

        game_id = data.get("id")
        if isinstance(game_id, str):
            if game_id in seen_ids:
                problems.append(f"duplicate id, also used by {seen_ids[game_id].name}")
            else:
                seen_ids[game_id] = path

        name = data.get("name")
        if isinstance(name, str):
            key = name.strip().casefold()
            if key in seen_names:
                problems.append(f"duplicate name, also used by {seen_names[key].name}")
            else:
                seen_names[key] = path

        if problems:
            failures += 1
            print(f"FAIL {path.name}")
            for problem in problems:
                print(f"  - {problem}")
        elif not args.quiet:
            print(f"ok   {path.name}")

    print(f"\n{len(paths) - failures}/{len(paths)} entries valid.")
    if failures:
        print(f"{failures} file(s) need attention.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
