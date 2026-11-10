"""Offline tests; fixture bytes are synthesized inside temporary directories."""

import gzip
import hashlib
import json
import re
import tempfile
import unittest
import uuid
from pathlib import Path

import prepare

PNG = b"\x89PNG\r\n\x1a\nsynthetic fixture"
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"/>'


class PrepareTest(unittest.TestCase):
    def fixture(self, root, entries):
        archive = root / "archive"
        manifest, catalog = [], []
        for index, (key, media, payload, registered) in enumerate(entries):
            path = archive / "objects" / key
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(payload)
            identity, digest = (
                str(uuid.UUID(int=index + 1)),
                hashlib.sha256(payload).hexdigest(),
            )
            manifest.append(
                {
                    "path": key,
                    "storage_id": identity,
                    "sha256": digest,
                    "bytes": len(payload),
                    "content_type": media,
                }
            )
            if registered:
                catalog.append(
                    {
                        "id": identity,
                        "path": key,
                        "sha256": digest if index == 0 else None,
                        "bytes": len(payload),
                        "mimetype": media,
                    }
                )
        (archive / "manifest.jsonl").write_text(
            "".join(json.dumps(r) + "\n" for r in manifest)
        )
        (archive / "catalog-inventory.json").write_text(json.dumps(catalog))
        metadata = archive / "metadata/api-export"
        metadata.mkdir(parents=True)
        with gzip.open(metadata / "object.jsonl.gz", "wt") as output:
            output.writelines(json.dumps(r) + "\n" for r in catalog)
        return archive

    def test_deduplicates_bytes_and_retains_catalog_and_storage_only_locations(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = self.fixture(
                root,
                [
                    ("first.png", "image/png", PNG, True),
                    ("legacy/peer.png", "image/png", PNG, True),
                    ("shapes/source.svg", "image/svg+xml", SVG, False),
                ],
            )
            output = root / "review"
            result = prepare.prepare(archive, output)
            self.assertEqual(
                (
                    result["source_keys"],
                    result["unique_objects"],
                    result["catalog_objects"],
                ),
                (3, 2, 2),
            )
            self.assertEqual(result["storage_only_keys"], 1)
            self.assertEqual(result["unique_bytes"], len(PNG) + len(SVG))
            self.assertEqual(
                len((output / "legacy-locations.jsonl").read_text().splitlines()), 3
            )
            sql = (output / "backfill.sql").read_text()
            self.assertIn("FULL JOIN library_hash_backfill", sql)
            self.assertIn("SET sha256 = m.sha256", sql)
            self.assertIn("previous_sha256", sql)
            self.assertNotIn("UPDATE grida_library.object_embedding", sql)
            self.assertEqual((archive / "objects/first.png").read_bytes(), PNG)

    def test_bad_hash_and_mime_fail_without_output(self):
        for broken in ("bytes", "mime"):
            with (
                self.subTest(broken=broken),
                tempfile.TemporaryDirectory() as directory,
            ):
                root = Path(directory)
                archive = self.fixture(root, [("first.png", "image/png", PNG, True)])
                if broken == "bytes":
                    (archive / "objects/first.png").write_bytes(PNG[:-1] + b"x")
                else:
                    path = archive / "manifest.jsonl"
                    path.write_text(path.read_text().replace("image/png", "image/gif"))
                with self.assertRaises(ValueError):
                    prepare.prepare(archive, root / "review")
                self.assertFalse((root / "review").exists())

    def test_rejects_path_escape_symlink_and_source_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = self.fixture(root, [("first.png", "image/png", PNG, True)])
            for key in (
                "../first.png",
                "/first.png",
                "a//b.png",
                "a/./b.png",
                "a\\b.png",
            ):
                with self.subTest(key=key), self.assertRaises(ValueError):
                    prepare.asset_file(archive, key)
            (archive / "objects/link.png").symlink_to(archive / "objects/first.png")
            with self.assertRaisesRegex(ValueError, "Symlink"):
                prepare.asset_file(archive, "link.png")
            with self.assertRaisesRegex(ValueError, "outside"):
                prepare.prepare(archive, archive / "review")

    def test_requires_matching_full_metadata_and_known_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = self.fixture(root, [("first.png", "image/png", PNG, True)])
            path = archive / "catalog-inventory.json"
            records = json.loads(path.read_text())
            records[0]["sha256"] = "0" * 64
            path.write_text(json.dumps(records))
            with self.assertRaisesRegex(ValueError, "full metadata"):
                prepare.prepare(archive, root / "review")
            with gzip.open(
                archive / "metadata/api-export/object.jsonl.gz", "wt"
            ) as target:
                target.write(json.dumps(records[0]) + "\n")
            with self.assertRaisesRegex(ValueError, "Known catalog SHA"):
                prepare.prepare(archive, root / "review")

    def test_copy_escapes_text_without_sql_literal_interpolation(self):
        self.assertEqual(prepare.copy_field(None), r"\N")
        self.assertEqual(prepare.copy_field("'\\N\t\n\\.\r"), r"'\\N\t\n\\.\r")
        self.assertIn("FROM STDIN;\n\\.\n", prepare.backfill_sql([]))

    def test_pinned_mime_map_matches_product(self):
        source = Path(__file__).resolve().parents[2] / "editor/lib/library/storage.ts"
        expected = dict(re.findall(r'"(image/[^"]+)": "([^"]+)"', source.read_text()))
        self.assertEqual(prepare.EXTENSIONS, expected)


if __name__ == "__main__":
    unittest.main()
