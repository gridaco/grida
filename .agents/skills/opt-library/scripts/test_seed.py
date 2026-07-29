"""Security regression tests for the optional Library seed."""

# GRIDA-SEC-009: Pin exact local destinations and fail-before-download order.

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

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
                mock.patch.object(seed.shutil, "which", return_value="/usr/bin/psql"),
                mock.patch.object(seed.subprocess, "run", return_value=result),
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


class SeedOrderingTest(unittest.TestCase):
    def test_destination_is_rejected_before_archive_download(self) -> None:
        rejection = seed.SeedError("not the configured local stack")
        with (
            mock.patch.object(
                seed.LocalSupabaseStatus,
                "discover",
                side_effect=rejection,
            ),
            mock.patch.object(seed.CorpusRelease, "download") as download,
            self.assertRaisesRegex(seed.SeedError, str(rejection)),
        ):
            seed.run(["seed"])

        download.assert_not_called()


if __name__ == "__main__":
    unittest.main()
