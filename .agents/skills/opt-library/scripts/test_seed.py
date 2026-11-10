"""Security regression tests for the optional Library seed."""

# GRIDA-SEC-009: Pin exact local destinations and fail-before-download order.

from __future__ import annotations

import hashlib
import io
import json
import subprocess
import sys
import tempfile
import unittest.mock
import uuid
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import seed


class LocalSupabaseConfigTest(unittest.TestCase):
    def setUp(self) -> None:
        self.config = seed.LocalSupabaseConfig(
            api_port=54_321,
            db_port=54_322,
            api_tls=False,
        )

    def test_accepts_exact_configured_endpoints(self) -> None:
        self.config.require_api_url("http://127.0.0.1:54321")
        self.config.require_api_url("http://127.0.0.1:54321/")
        self.config.require_db_url(
            "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
        )
        self.config.require_db_url(
            "postgres://postgres:postgres@127.0.0.1:54322/postgres"
        )

    def test_rejects_noncanonical_api_endpoints(self) -> None:
        invalid = [
            "https://project.supabase.co",
            "http://localhost:54321",
            "http://[::1]:54321",
            "http://127.0.0.2:54321",
            "http://127.0.0.1.evil.example:54321",
            "https://127.0.0.1:54321",
            "http://127.0.0.1:65421",
            "http://user@127.0.0.1:54321",
            "http://127.0.0.1:54321/rest/v1",
            "http://127.0.0.1:54321?target=production",
        ]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(seed.SeedError):
                self.config.require_api_url(value)

    def test_rejects_noncanonical_database_endpoints(self) -> None:
        invalid = [
            "postgresql://postgres:postgres@project.supabase.co:5432/postgres",
            "postgresql://postgres:postgres@localhost:54322/postgres",
            "postgresql://postgres:postgres@[::1]:54322/postgres",
            "postgresql://postgres:postgres@127.0.0.2:54322/postgres",
            "postgresql://postgres:postgres@127.0.0.1.evil:54322/postgres",
            "postgresql://postgres:postgres@127.0.0.1:65422/postgres",
            "http://postgres:postgres@127.0.0.1:54322/postgres",
            "postgresql://other:postgres@127.0.0.1:54322/postgres",
            "postgresql://postgres:postgres@127.0.0.1:54322/other",
            "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=prod",
            "postgresql://postgres:postgres@127.0.0.1:54322/postgres#prod",
        ]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(seed.SeedError):
                self.config.require_db_url(value)

    def test_loads_only_ports_and_tls_from_local_config(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "supabase").mkdir()
            (root / "supabase" / "config.toml").write_text(
                """
[api]
port = 6001
[api.tls]
enabled = true
[db]
port = 6002
""".strip(),
                encoding="utf-8",
            )
            config = seed.LocalSupabaseConfig.load(root)

        self.assertEqual(config.api_origin, "https://127.0.0.1:6001")
        self.assertEqual(config.db_port, 6002)


class LocalSupabaseStatusTest(unittest.TestCase):
    def test_discovery_rejects_remote_status(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "supabase").mkdir()
            (root / "supabase" / "config.toml").write_text(
                "[api]\nport = 54321\n[db]\nport = 54322\n",
                encoding="utf-8",
            )
            result = subprocess.CompletedProcess(
                args=["supabase", "status", "-o", "json"],
                returncode=0,
                stdout=json.dumps(
                    {
                        "API_URL": "https://project.supabase.co",
                        "DB_URL": (
                            "postgresql://postgres:secret@db.project.supabase.co:"
                            "5432/postgres"
                        ),
                        "SERVICE_ROLE_KEY": "must-not-be-used",
                    }
                ),
                stderr="",
            )
            with (
                unittest.mock.patch.object(
                    seed.shutil, "which", return_value="/usr/bin/psql"
                ),
                unittest.mock.patch.object(seed.subprocess, "run", return_value=result),
                self.assertRaises(seed.SeedError),
            ):
                seed.LocalSupabaseStatus.discover(root)

    def test_writer_revalidates_status(self) -> None:
        config = seed.LocalSupabaseConfig(
            api_port=54_321,
            db_port=54_322,
            api_tls=False,
        )
        status = seed.LocalSupabaseStatus(
            api_url="https://project.supabase.co",
            db_url="postgresql://postgres:secret@127.0.0.1:54322/postgres",
            service_role_key="must-not-be-used",
            config=config,
        )
        with self.assertRaises(seed.SeedError):
            seed.LocalLibrary(status)


class LocalLibraryTransportTest(unittest.TestCase):
    def setUp(self) -> None:
        config = seed.LocalSupabaseConfig(
            api_port=54_321,
            db_port=54_322,
            api_tls=False,
        )
        self.status = seed.LocalSupabaseStatus(
            api_url="http://127.0.0.1:54321",
            db_url="postgresql://postgres:postgres@127.0.0.1:54322/postgres",
            service_role_key="local-test-key",
            config=config,
        )

    def test_local_http_writer_disables_proxies_and_redirects(self) -> None:
        opener = unittest.mock.MagicMock()
        with unittest.mock.patch.object(
            seed.urllib.request,
            "build_opener",
            return_value=opener,
        ) as build_opener:
            library = seed.LocalLibrary(self.status)

        handlers = build_opener.call_args.args
        proxy_handler = next(
            handler
            for handler in handlers
            if isinstance(handler, seed.urllib.request.ProxyHandler)
        )
        self.assertEqual(proxy_handler.proxies, {})
        redirect_handler = next(
            handler
            for handler in handlers
            if isinstance(handler, seed.LocalOnlyRedirectHandler)
        )
        self.assertIsNone(
            redirect_handler.redirect_request(
                unittest.mock.MagicMock(),
                unittest.mock.MagicMock(),
                302,
                "Found",
                unittest.mock.MagicMock(),
                "https://example.com/",
            )
        )

        response = unittest.mock.MagicMock()
        response.__enter__.return_value.read.return_value = b"[]"
        opener.open.return_value = response
        with unittest.mock.patch.object(
            seed.urllib.request, "urlopen"
        ) as global_urlopen:
            self.assertEqual(
                library._request_json("GET", "/rest/v1/object"),
                [],
            )
        global_urlopen.assert_not_called()
        opener.open.assert_called_once()

    def test_psql_cannot_inherit_connection_overrides(self) -> None:
        library = seed.LocalLibrary(self.status)
        environment = {
            "PATH": "/usr/bin",
            "LANG": "C",
            "PGHOSTADDR": "203.0.113.10",
            "PGSERVICE": "production",
            "PGOPTIONS": "-c search_path=public",
            "pgpassword": "must-also-be-removed",
        }
        with (
            unittest.mock.patch.dict(seed.os.environ, environment, clear=True),
            unittest.mock.patch.object(seed.subprocess, "run") as run,
        ):
            library._import_database([], [], [])

        child_environment = run.call_args.kwargs["env"]
        self.assertEqual(
            child_environment,
            {
                "PATH": "/usr/bin",
                "LANG": "C",
            },
        )

    def test_empty_import_has_no_null_source_rows(self) -> None:
        sql = seed.build_import_sql([], [], [])

        self.assertEqual(sql.count("WHERE source.payload IS NOT NULL"), 5)

    def test_catalog_identity_does_not_come_from_storage_response(self) -> None:
        payload = b"local corpus fixture"
        digest = hashlib.sha256(payload).hexdigest()
        obj = seed.CorpusObject(
            ref=f"sha256:{digest}",
            sha256=digest,
            asset_path=f"assets/{digest}.png",
            metadata={"mimetype": "image/png", "title": "Fixture"},
        )
        embedding = seed.CorpusEmbedding(obj.ref, [1.0] + [0.0] * 1535, None)
        catalog_id = uuid.UUID("10000000-0000-4000-8000-000000000001")
        storage_id = "20000000-0000-4000-8000-000000000002"
        library = seed.LocalLibrary(self.status)
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "corpus.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr(obj.asset_path, payload)
            corpus = seed.VerifiedCorpus(
                archive_path, {}, [], [obj], {obj.ref: embedding}
            )
            with (
                unittest.mock.patch.object(
                    library, "_existing_objects", return_value={}
                ),
                unittest.mock.patch.object(
                    library, "_request_json", return_value={"Id": storage_id}
                ) as request,
                unittest.mock.patch.object(library, "_import_database") as database,
                unittest.mock.patch.object(library, "_verify_public_asset"),
                unittest.mock.patch.object(seed.uuid, "uuid4", return_value=catalog_id),
                unittest.mock.patch("builtins.print"),
            ):
                library.seed(corpus, [obj], {obj.ref: embedding})

        _, objects, embeddings = database.call_args.args
        self.assertEqual(objects[0]["id"], str(catalog_id))
        self.assertNotEqual(objects[0]["id"], storage_id)
        self.assertEqual(objects[0]["path"], obj.storage_path)
        self.assertEqual(embeddings[0]["object_id"], str(catalog_id))
        self.assertEqual(
            embeddings[0]["gemini_embedding_2__image"],
            seed.vector_literal(embedding.image),
        )
        self.assertIsNone(embeddings[0]["gemini_embedding_2__text"])
        self.assertEqual(request.call_args.kwargs["headers"]["x-upsert"], "false")

    def test_existing_duplicate_hash_adopts_first_ordered_catalog_record(self) -> None:
        digest = "a" * 64
        rows = [
            {"id": "first", "path": "legacy/first.png", "sha256": digest},
            {"id": "peer", "path": "legacy/peer.png", "sha256": digest},
        ]
        library = seed.LocalLibrary(self.status)
        with unittest.mock.patch.object(
            library, "_request_json", return_value=rows
        ) as request:
            existing = library._existing_objects()
        self.assertEqual(existing[digest]["id"], "first")
        self.assertEqual(len(rows), 2)
        query = request.call_args.args[1]
        self.assertIn("order=created_at.asc,id.asc", query)

    def test_existing_hash_scan_continues_past_api_page_cap(self) -> None:
        rows = [
            {
                "id": str(uuid.UUID(int=index + 1)),
                "path": f"{index:064x}.png",
                "sha256": f"{index:064x}",
            }
            for index in range(1001)
        ]
        library = seed.LocalLibrary(self.status)
        with unittest.mock.patch.object(
            library, "_request_json", side_effect=[rows[:1000], rows[1000:]]
        ) as request:
            existing = library._existing_objects()
        self.assertEqual(len(existing), 1001)
        self.assertIn("limit=1000&offset=1000", request.call_args.args[1])

    def test_previously_stored_bytes_are_verified_before_adoption(self) -> None:
        payload = b"already stored fixture"
        digest = hashlib.sha256(payload).hexdigest()
        library = seed.LocalLibrary(self.status)
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.read.return_value = payload
        duplicate = seed.urllib.error.HTTPError(
            "http://127.0.0.1:54321/storage/v1/object/library/fixture.png",
            400,
            "Bad Request",
            None,
            io.BytesIO(b'{"statusCode":"409","error":"Duplicate"}'),
        )
        library._local_opener.open = unittest.mock.MagicMock(
            side_effect=[duplicate, response]
        )
        self.assertIsNone(library._upload(f"{digest}.png", payload, "image/png"))
        calls = library._local_opener.open.call_args_list
        self.assertEqual(len(calls), 2)
        upload = calls[0].args[0]
        request_headers = {k.lower(): v for k, v in upload.header_items()}
        self.assertEqual(request_headers["x-upsert"], "false")
        self.assertEqual(upload.data, payload)
        self.assertEqual(calls[1].args[0].get_method(), "GET")

    def test_conflicting_stored_bytes_are_never_overwritten(self) -> None:
        library = seed.LocalLibrary(self.status)
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.read.return_value = b"different bytes"
        duplicate = seed.urllib.error.HTTPError(
            "http://127.0.0.1:54321/storage/v1/object/library/fixture.png",
            409,
            "Conflict",
            None,
            io.BytesIO(b'{"statusCode":"409","error":"Duplicate"}'),
        )
        library._local_opener.open = unittest.mock.MagicMock(
            side_effect=[duplicate, response]
        )
        with self.assertRaisesRegex(seed.SeedError, "failed verification"):
            library._upload("fixture.png", b"intended bytes", "image/png")
        self.assertEqual(library._local_opener.open.call_count, 2)

    def test_permission_failure_is_not_an_already_exists_success(self) -> None:
        library = seed.LocalLibrary(self.status)
        denied = seed.urllib.error.HTTPError(
            "http://127.0.0.1:54321/storage/v1/object/library/fixture.png",
            403,
            "Forbidden",
            None,
            io.BytesIO(b'{"statusCode":"403","error":"Unauthorized"}'),
        )
        library._local_opener.open = unittest.mock.MagicMock(side_effect=denied)
        with self.assertRaisesRegex(seed.SeedError, "403"):
            library._upload("fixture.png", b"intended bytes", "image/png")
        self.assertEqual(library._local_opener.open.call_count, 1)


class CorpusVerificationTest(unittest.TestCase):
    def test_missing_asset_is_a_seed_error(self) -> None:
        digest = "a" * 64
        ref = f"sha256:{digest}"
        manifest = {
            "category": {"id": "home"},
            "object_count": 1,
            "licenses": {},
        }
        records = [
            {
                "ref": ref,
                "sha256": digest,
                "asset_path": f"assets/{digest}.png",
                "metadata": {
                    "category": "home",
                    "bytes": 1,
                },
            }
        ]

        with tempfile.SpooledTemporaryFile() as buffer:
            with (
                zipfile.ZipFile(buffer, mode="w") as archive,
                self.assertRaisesRegex(
                    seed.SeedError,
                    f"{ref}: asset is missing from the corpus archive",
                ),
            ):
                seed.CorpusArchive._verify_objects(
                    archive,
                    manifest,
                    [{"id": "home"}],
                    records,
                )


class SeedOrderingTest(unittest.TestCase):
    def test_destination_is_rejected_before_archive_download(self) -> None:
        rejection = seed.SeedError("not the configured local stack")
        with (
            unittest.mock.patch.object(
                seed.LocalSupabaseStatus,
                "discover",
                side_effect=rejection,
            ),
            unittest.mock.patch.object(seed.CorpusRelease, "download") as download,
            self.assertRaisesRegex(seed.SeedError, str(rejection)),
        ):
            seed.run(["seed"])

        download.assert_not_called()


if __name__ == "__main__":
    unittest.main()
