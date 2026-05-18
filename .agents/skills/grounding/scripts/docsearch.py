#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml>=6"]
# ///
"""
docsearch — query Grida docs by YAML frontmatter ONLY.

Never reads the document body: it stops at the closing `---` fence, so
scanning all ~360 docs is one cheap pass. Use it to pick the 1-3 right
docs by tag/field before opening anything, instead of globbing or
grepping full files.

The docs root is auto-detected by walking up to `docs/tags.yml`, so this
runs from any cwd. Override with --root.

COMMANDS
  tags                       Tag vocabulary (docs/tags.yml) + live usage
                             counts + drift (defined-unused / used-undefined).
  find  [filters] [SUBDIR…]  Docs whose frontmatter matches ALL filters.
                             Optional SUBDIR args scope the scan (relative
                             to docs root, e.g. `wg/feat-svg reference`).
  show  PATH                 Parsed frontmatter for one file (path is
                             relative to cwd or docs root).

find FILTERS
  --tag T        require tag T   (repeatable; AND across tags by default)
  --any          combine --tag with OR instead of AND
  --field K=V    require frontmatter field K == V (repeatable, case-insens.;
                 list fields match if V is one of the items)
  --has K        require key K present in frontmatter (repeatable)
  --match RE     Python regex tested against the RAW frontmatter text only
  --json         machine-readable output

EXAMPLES
  docsearch tags
  docsearch tags --alpha
  docsearch find --tag canvas --tag svg
  docsearch find --any --tag figma --tag svg wg
  docsearch find --has doc_tasks
  docsearch find --field draft=true
  docsearch find --match 'unlisted:\\s*true'
  docsearch show wg/feat-svg/pattern.md
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import yaml

MAX_FM_LINES = 300  # safety cap when a file has an opening `---` but no closer


def find_docs_root(override: str | None) -> Path:
    if override:
        p = Path(override).resolve()
        if (p / "tags.yml").exists():
            return p
        if (p / "docs" / "tags.yml").exists():
            return p / "docs"
        sys.exit(f"docsearch: no tags.yml under --root {p}")
    # walk up from cwd, then from this script's location
    for start in (Path.cwd(), Path(__file__).resolve().parent):
        cur = start
        for _ in range(40):
            if (cur / "docs" / "tags.yml").exists():
                return cur / "docs"
            if cur.name == "docs" and (cur / "tags.yml").exists():
                return cur
            if cur.parent == cur:
                break
            cur = cur.parent
    sys.exit("docsearch: could not locate docs/tags.yml (pass --root)")


def read_frontmatter(path: Path) -> tuple[dict | None, str]:
    """Return (parsed_dict_or_None, raw_block_text). Reads only the fence."""
    raw_lines: list[str] = []
    try:
        with path.open("r", encoding="utf-8-sig", errors="replace") as fh:
            first = fh.readline()
            if first.strip() != "---":
                return None, ""
            for _ in range(MAX_FM_LINES):
                line = fh.readline()
                if line == "":  # EOF before closer
                    return None, ""
                if line.strip() == "---":
                    raw = "".join(raw_lines)
                    try:
                        data = yaml.safe_load(raw)
                    except yaml.YAMLError:
                        return None, raw
                    return (data if isinstance(data, dict) else {}), raw
                raw_lines.append(line)
    except OSError:
        return None, ""
    return None, ""


def iter_docs(root: Path, subdirs: list[str]):
    bases = [root] if not subdirs else [(root / s) for s in subdirs]
    for base in bases:
        if not base.exists():
            sys.exit(f"docsearch: path not found: {base}")
        for path in sorted([*base.rglob("*.md"), *base.rglob("*.mdx")]):
            yield path


def as_list(v) -> list[str]:
    if v is None:
        return []
    if isinstance(v, (list, tuple)):
        return [str(x) for x in v]
    return [str(v)]


def field_matches(meta: dict, key: str, want: str) -> bool:
    if key not in meta:
        return False
    want_l = want.strip().lower()
    return any(x.strip().lower() == want_l for x in as_list(meta[key]))


def cmd_tags(root: Path, args) -> int:
    vocab_path = root / "tags.yml"
    vocab = yaml.safe_load(vocab_path.read_text(encoding="utf-8")) or {}

    counts: dict[str, int] = {}
    total = 0
    for path in iter_docs(root, []):
        meta, _ = read_frontmatter(path)
        if meta is None:
            continue
        total += 1
        for t in as_list(meta.get("tags")):
            counts[t] = counts.get(t, 0) + 1

    defined = set(vocab.keys())
    used = set(counts.keys())

    rows = []
    for key, spec in vocab.items():
        label = spec.get("label", key) if isinstance(spec, dict) else key
        desc = spec.get("description", "") if isinstance(spec, dict) else ""
        rows.append((key, label, desc, counts.get(key, 0)))

    if args.alpha:
        rows.sort(key=lambda r: r[0])
    else:
        rows.sort(key=lambda r: (-r[3], r[0]))

    if args.json:
        print(
            json.dumps(
                {
                    "docs_scanned": total,
                    "tags": [
                        {"key": k, "label": lb, "count": c, "description": d}
                        for (k, lb, d, c) in rows
                    ],
                    "defined_unused": sorted(defined - used),
                    "used_undefined": sorted(used - defined),
                },
                indent=2,
            )
        )
        return 0

    print(f"# {len(vocab)} tags defined in docs/tags.yml — {total} docs scanned\n")
    width = max((len(r[0]) for r in rows), default=4)
    for key, _label, desc, cnt in rows:
        mark = f"{cnt:>4}" if cnt else "   ·"
        print(f"{mark}  {key.ljust(width)}  {desc}")

    unused = sorted(defined - used)
    undef = sorted(used - defined)
    if unused:
        print(f"\n# defined but unused ({len(unused)}): {', '.join(unused)}")
    if undef:
        print(
            f"\n# WARNING used but NOT in tags.yml ({len(undef)}): "
            f"{', '.join(undef)}"
        )
    return 0


def cmd_find(root: Path, args) -> int:
    want_tags = [t.lower() for t in (args.tag or [])]
    fields = []
    for raw in args.field or []:
        if "=" not in raw:
            sys.exit(f"docsearch: --field expects K=V, got {raw!r}")
        k, v = raw.split("=", 1)
        fields.append((k.strip(), v))
    has_keys = args.has or []
    rx = re.compile(args.match) if args.match else None

    results = []
    for path in iter_docs(root, args.subdir):
        meta, raw = read_frontmatter(path)
        if meta is None:
            continue
        if want_tags:
            doc_tags = {t.lower() for t in as_list(meta.get("tags"))}
            ok = (
                any(t in doc_tags for t in want_tags)
                if args.any
                else all(t in doc_tags for t in want_tags)
            )
            if not ok:
                continue
        if any(not field_matches(meta, k, v) for k, v in fields):
            continue
        if any(k not in meta for k in has_keys):
            continue
        if rx and not rx.search(raw):
            continue
        results.append((path, meta))

    rel = [
        (str(p.relative_to(root.parent) if root.parent in p.parents else p), m)
        for p, m in results
    ]

    if args.json:
        print(
            json.dumps(
                [
                    {
                        "path": pth,
                        "title": m.get("title"),
                        "tags": as_list(m.get("tags")),
                        "description": m.get("description"),
                    }
                    for pth, m in rel
                ],
                indent=2,
            )
        )
        return 0 if rel else 1

    for pth, m in rel:
        print(pth)
        if m.get("title"):
            print(f"  title: {m['title']}")
        tg = as_list(m.get("tags"))
        if tg:
            print(f"  tags:  {', '.join(tg)}")
        if m.get("description"):
            d = str(m["description"]).strip().replace("\n", " ")
            print(f"  desc:  {d[:140]}")
    print(f"\n# {len(rel)} match(es)")
    return 0 if rel else 1


def cmd_show(root: Path, args) -> int:
    p = Path(args.path)
    if not p.exists():
        p = root / args.path
    if not p.exists():
        p = root.parent / args.path
    if not p.exists():
        sys.exit(f"docsearch: file not found: {args.path}")
    meta, raw = read_frontmatter(p)
    if meta is None:
        print(f"{p}: no parseable frontmatter")
        return 1
    if args.json:
        print(json.dumps(meta, indent=2, default=str))
    else:
        print(f"# {p}\n")
        print(raw.rstrip())
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(prog="docsearch", add_help=True)
    ap.add_argument("--root", help="docs dir (default: auto-detect via tags.yml)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    t = sub.add_parser("tags", help="list tag vocabulary + usage")
    t.add_argument("--alpha", action="store_true", help="sort A-Z (default: by count)")
    t.add_argument("--json", action="store_true")

    f = sub.add_parser("find", help="find docs by frontmatter")
    f.add_argument("subdir", nargs="*", help="restrict to these subdirs of docs root")
    f.add_argument("--tag", action="append")
    f.add_argument("--any", action="store_true", help="OR the --tag filters")
    f.add_argument("--field", action="append", help="K=V frontmatter equality")
    f.add_argument("--has", action="append", help="frontmatter key must be present")
    f.add_argument("--match", help="regex over raw frontmatter text")
    f.add_argument("--json", action="store_true")

    s = sub.add_parser("show", help="print one file's frontmatter")
    s.add_argument("path")
    s.add_argument("--json", action="store_true")

    args = ap.parse_args()
    root = find_docs_root(args.root)

    if args.cmd == "tags":
        return cmd_tags(root, args)
    if args.cmd == "find":
        return cmd_find(root, args)
    if args.cmd == "show":
        return cmd_show(root, args)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
