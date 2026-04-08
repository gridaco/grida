#!/usr/bin/env python3
"""
validate.py — Validate post length for Twitter/Reddit.

Usage:
  python3 validate.py "Your post text here"
  python3 validate.py draft.txt
  echo "Your post text" | python3 validate.py -

If the positional argument is an existing file path, it reads the file.
Otherwise it treats it as literal text.

Limits:
  Twitter:  280 chars
  Reddit title: 300 chars
  Reddit body: 40000 chars
"""

import sys
import argparse
from pathlib import Path

LIMITS = {
    "tweet": 280,
    "reddit_title": 300,
    "reddit_body": 40000,
}


def validate(text: str) -> None:
    chars = len(text)
    words = len(text.split())
    lines = text.count("\n") + 1

    print(f"chars: {chars}")
    print(f"words: {words}")
    print(f"lines: {lines}")
    print()

    for name, limit in LIMITS.items():
        ok = chars <= limit
        remaining = limit - chars
        status = "OK" if ok else "OVER"
        label = f"{name} ({limit})"
        print(f"  {label:<20s}  {status:<5s}  {remaining:+d} chars")

    # exit 1 if over tweet limit (primary use case)
    if chars > LIMITS["tweet"]:
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate post length")
    parser.add_argument("text", nargs="?", help="Post text, file path, or '-' for stdin")
    args = parser.parse_args()

    if args.text == "-" or (args.text is None and not sys.stdin.isatty()):
        text = sys.stdin.read().strip()
    elif args.text:
        p = Path(args.text)
        if p.is_file():
            text = p.read_text().strip()
        else:
            text = args.text
    else:
        parser.print_help()
        sys.exit(2)

    validate(text)


if __name__ == "__main__":
    main()
