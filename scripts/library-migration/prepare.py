#!/usr/bin/env python3
"""Verify a local Library archive and prepare files for a reviewed migration."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path

# Mirrors LibraryStorage.extension in editor/lib/library/storage.ts.
EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/avif": "avif",
}
FIELDS = ("id", "path", "bytes", "mimetype", "sha256")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def asset_file(archive: Path, key: str) -> Path:
    require(isinstance(key, str) and bool(key), "Empty or invalid source path")
    require(
        not key.startswith("/") and "\\" not in key and "\0" not in key,
        "Unsafe source path",
    )
    require(all(p not in ("", ".", "..") for p in key.split("/")), "Unsafe source path")
    base, path = archive / "objects", archive / "objects" / key
    require(
        path.resolve().is_relative_to(base.resolve()), "Source path escapes objects"
    )
    for parent in (path, *path.parents):
        require(not parent.is_symlink(), "Symlink in source object path")
        if parent == base:
            break
    require(path.is_file(), "Source object is missing")
    return path


def hash_file(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def verify_type(path: Path, mimetype: str) -> None:
    with path.open("rb") as source:
        head = source.read(128)
    valid = {
        "image/jpeg": head.startswith(b"\xff\xd8\xff"),
        "image/png": head.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": head[:4] == b"RIFF" and head[8:12] == b"WEBP",
        "image/gif": head[:6] in (b"GIF87a", b"GIF89a"),
        "image/avif": head[4:8] == b"ftyp"
        and any(
            head[i : i + 4] in (b"avif", b"avis") for i in (8, *range(16, len(head), 4))
        ),
    }
    if mimetype == "image/svg+xml":
        valid[mimetype] = ET.parse(path).getroot().tag.rsplit("}", 1)[-1] == "svg"
    require(valid.get(mimetype, False), "Stored bytes disagree with recorded MIME")


def copy_field(value: object) -> str:
    if value is None:
        return r"\N"
    text = str(value)
    require("\0" not in text, "NUL cannot be represented in PostgreSQL text")
    for original, escaped in (
        ("\\", "\\\\"),
        ("\t", r"\t"),
        ("\n", r"\n"),
        ("\r", r"\r"),
    ):
        text = text.replace(original, escaped)
    return text


def backfill_sql(rows: list[dict]) -> str:
    data = "".join(
        "\t".join(copy_field(row[k]) for k in (*FIELDS, "previous_sha256")) + "\n"
        for row in rows
    )
    return (
        r"""\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
LOCK TABLE grida_library.object IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE library_hash_backfill (
  id uuid PRIMARY KEY, path text UNIQUE NOT NULL, bytes bigint NOT NULL,
  mimetype text NOT NULL, sha256 text NOT NULL, previous_sha256 text
) ON COMMIT DROP;
COPY library_hash_backfill (id,path,bytes,mimetype,sha256,previous_sha256) FROM STDIN;
"""
        + data
        + r"""\.
DO $verify$
BEGIN
  IF to_regclass('grida_library.object_sha256_key') IS NOT NULL THEN
    RAISE EXCEPTION 'Apply the storage-independent forward migration first';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'grida_library.object'::regclass
    AND NOT tgisinternal AND tgenabled IN ('O','A') AND (tgtype & 16) <> 0) THEN
    RAISE EXCEPTION 'Review catalog UPDATE triggers before hash backfill';
  END IF;
  IF EXISTS (
    SELECT 1 FROM grida_library.object o FULL JOIN library_hash_backfill m USING(id)
    WHERE o.id IS NULL OR m.id IS NULL OR o.path IS DISTINCT FROM m.path
      OR o.bytes IS DISTINCT FROM m.bytes OR o.mimetype IS DISTINCT FROM m.mimetype
      OR (o.sha256 IS NOT NULL AND o.sha256 IS DISTINCT FROM m.sha256)
      OR (m.previous_sha256 IS NOT NULL AND o.sha256 IS DISTINCT FROM m.previous_sha256)
      OR m.sha256 !~ '^[a-f0-9]{64}$'
  ) THEN
    RAISE EXCEPTION 'Catalog coverage, byte facts or existing hashes differ from archive';
  END IF;
END
$verify$;
CREATE TEMP TABLE library_hash_metadata_before ON COMMIT DROP AS
  SELECT id, to_jsonb(o) - 'sha256' AS metadata FROM grida_library.object o;
UPDATE grida_library.object o SET sha256 = m.sha256
FROM library_hash_backfill m WHERE o.id = m.id AND o.sha256 IS DISTINCT FROM m.sha256;
DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM library_hash_metadata_before b
    FULL JOIN grida_library.object o USING(id)
    WHERE b.id IS NULL OR o.id IS NULL OR b.metadata IS DISTINCT FROM to_jsonb(o) - 'sha256')
    OR EXISTS (SELECT 1 FROM library_hash_backfill m JOIN grida_library.object o USING(id)
      WHERE o.sha256 IS DISTINCT FROM m.sha256) THEN
    RAISE EXCEPTION 'Hash update changed catalog metadata or failed verification';
  END IF;
END
$verify$;
COMMIT;
"""
    )


def prepare(archive: Path, output: Path) -> dict:
    archive, output = archive.resolve(), output.resolve()
    require(
        not output.is_relative_to(archive), "Output must be outside the source archive"
    )
    require(not output.exists(), "Output already exists; choose a new review directory")
    manifest_path, catalog_path = (
        archive / "manifest.jsonl",
        archive / "catalog-inventory.json",
    )
    raw = [
        json.loads(line)
        for line in manifest_path.read_text().splitlines()
        if line.strip()
    ]
    require(bool(raw), "Source manifest is empty")
    require(
        all(isinstance(r, dict) and isinstance(r.get("path"), str) for r in raw),
        "Invalid source manifest row",
    )
    require(len({r["storage_id"] for r in raw}) == len(raw), "Duplicate Storage UUID")
    by_path, unique, legacy = {}, {}, []
    for row in sorted(raw, key=lambda r: r["path"]):
        key, digest, length = row["path"], row["sha256"], row["bytes"]
        require(key not in by_path, "Duplicate source path")
        require(
            isinstance(digest, str)
            and re.fullmatch(r"[a-f0-9]{64}", digest) is not None,
            "Invalid source SHA-256",
        )
        require(type(length) is int and length > 0, "Invalid source byte length")
        require(
            str(uuid.UUID(row["storage_id"])) == row["storage_id"],
            "Invalid Storage UUID",
        )
        media = row["content_type"].split(";", 1)[0].strip().lower()
        require(media in EXTENSIONS, "Unsupported source MIME")
        path = asset_file(archive, key)
        require(path.stat().st_size == length, "Source length differs from manifest")
        require(hash_file(path) == digest, "Source SHA-256 differs from manifest")
        verify_type(path, media)
        target = {
            "sha256": digest,
            "bytes": length,
            "mimetype": media,
            "object_key": digest + "." + EXTENSIONS[media],
            "source_path": "objects/" + key,
        }
        if digest in unique:
            require(
                all(
                    unique[digest][k] == target[k]
                    for k in ("bytes", "mimetype", "object_key")
                ),
                "Identical hashes have conflicting byte facts",
            )
        else:
            unique[digest] = target
        mapped = {
            "path": key,
            "storage_id": row["storage_id"],
            "sha256": digest,
            "bytes": length,
            "mimetype": media,
            "object_key": target["object_key"],
            "storage_version": row.get("storage_version"),
            "source_etag": row.get("source_etag"),
        }
        legacy.append(mapped)
        by_path[key] = mapped
    inventory_path = archive / "storage-before.json"
    if inventory_path.exists():
        inventory = json.loads(inventory_path.read_text())
        require(
            len(inventory) == len(by_path)
            and {r["path"] for r in inventory} == set(by_path),
            "Frozen Storage inventory coverage differs from manifest",
        )
        require(
            all(
                r["id"] == by_path[r["path"]]["storage_id"]
                and r["metadata"]["size"] == by_path[r["path"]]["bytes"]
                for r in inventory
            ),
            "Frozen Storage identity/size differs from manifest",
        )
    catalog = json.loads(catalog_path.read_text())
    complete_path = archive / "metadata/api-export/object.jsonl.gz"
    require(complete_path.is_file(), "Full portable object metadata export is required")
    with gzip.open(complete_path, "rt", encoding="utf-8") as source:
        complete = [
            {k: row[k] for k in FIELDS}
            for line in source
            if line.strip()
            for row in [json.loads(line)]
        ]
    require(len({r["id"] for r in catalog}) == len(catalog), "Duplicate catalog UUID")
    baseline = {r["id"]: {k: r[k] for k in FIELDS} for r in catalog}
    require(
        len(complete) == len(baseline) and {r["id"]: r for r in complete} == baseline,
        "Catalog inventory differs from full metadata export",
    )
    mapping = []
    for row in sorted(baseline.values(), key=lambda r: r["id"]):
        require(str(uuid.UUID(row["id"])) == row["id"], "Invalid catalog UUID")
        require(
            type(row["bytes"]) is int and row["bytes"] > 0,
            "Invalid catalog byte length",
        )
        stored = by_path.get(row["path"])
        require(
            stored is not None and stored["storage_id"] == row["id"],
            "Catalog source identity is absent",
        )
        require(
            row["bytes"] == stored["bytes"] and row["mimetype"] == stored["mimetype"],
            "Catalog and stored byte facts disagree",
        )
        require(
            row["sha256"] is None or row["sha256"] == stored["sha256"],
            "Known catalog SHA-256 disagrees",
        )
        mapping.append(
            {**row, "sha256": stored["sha256"], "previous_sha256": row["sha256"]}
        )
    require(len({r["path"] for r in mapping}) == len(mapping), "Duplicate catalog path")
    summary = {
        "source_keys": len(raw),
        "source_bytes": sum(r["bytes"] for r in raw),
        "unique_objects": len(unique),
        "unique_bytes": sum(r["bytes"] for r in unique.values()),
        "catalog_objects": len(mapping),
        "known_hashes": sum(r["previous_sha256"] is not None for r in mapping),
        "catalog_digests": len({r["sha256"] for r in mapping}),
        "storage_only_keys": len(raw) - len(mapping),
        "source_manifest_sha256": hash_file(manifest_path),
        "source_catalog_sha256": hash_file(catalog_path),
        "database_executed": False,
        "storage_written": False,
    }
    output.mkdir(parents=True)
    for filename, rows in (
        ("objects.jsonl", sorted(unique.values(), key=lambda r: r["sha256"])),
        ("legacy-locations.jsonl", legacy),
    ):
        (output / filename).write_text(
            "".join(json.dumps(r, sort_keys=True) + "\n" for r in rows)
        )
    (output / "backfill.sql").write_text(backfill_sql(mapping))
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    (output / "SHA256SUMS").write_text(
        "".join(hash_file(p) + "  " + p.name + "\n" for p in sorted(output.iterdir()))
    )
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(prepare(args.archive, args.output), indent=2))
    except (ValueError, OSError, KeyError, ET.ParseError) as error:
        parser.exit(1, f"Preparation failed: {error}\n")


if __name__ == "__main__":
    main()
