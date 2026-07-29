#!/usr/bin/env python3
"""Download, verify, and seed the optional Grida Library developer corpus."""

# GRIDA-SEC-009: Library fixture writes are locked to this checkout's exact
# 127.0.0.1 Supabase API and database ports.

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

import tomllib

RELEASE_TAG = "developer-corpus-home-v1-rc.1"
RELEASE_ASSET = "grida-library-home-developer-corpus.zip"
RELEASE_SHA256 = "ddf5fb1fa82b57a70b92cf99fe8706927cdc6d49ada2ff17e0e1ad617e46c6ec"
RELEASE_URL = (
    "https://github.com/gridaco/library/releases/download/"
    f"{RELEASE_TAG}/{RELEASE_ASSET}"
)

FORMAT = "grida-library-developer-corpus"
FORMAT_VERSION = 1
EMBEDDING_MODEL = "google/gemini-embedding-2"
EMBEDDING_DIMENSIONS = 1536
MAX_ARCHIVE_ENTRIES = 2_000
MAX_EXPANDED_BYTES = 512 * 1024 * 1024
MAX_ASSET_BYTES = 3 * 1024 * 1024
SUPPORTED_LICENSES = {"CC0-1.0", "LicenseRef-GridaLibrary"}
DOWNLOAD_CHUNK_BYTES = 1024 * 1024
REQUIRED_ENTRIES = {
    "README.md",
    "manifest.json",
    "checksums.sha256",
    "objects.jsonl",
    "embeddings.jsonl",
    "categories.json",
}
OBJECT_METADATA_FIELDS = {
    "alt",
    "background",
    "bytes",
    "categories",
    "category",
    "color",
    "colors",
    "description",
    "entropy",
    "fill",
    "gravity_x",
    "gravity_y",
    "height",
    "keywords",
    "lang",
    "license",
    "mimetype",
    "objects",
    "orientation",
    "public_domain",
    "score",
    "title",
    "transparency",
    "version",
    "width",
    "year",
}


class SeedError(RuntimeError):
    """A safe, user-facing failure in the optional seed workflow."""


class LocalOnlyRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Reject redirects so local service-role requests stay on loopback."""

    def redirect_request(
        self,
        request: urllib.request.Request,
        file_pointer: Any,
        code: int,
        message: str,
        headers: Any,
        new_url: str,
    ) -> None:
        return None


@dataclass(frozen=True)
class CorpusObject:
    ref: str
    sha256: str
    asset_path: str
    metadata: Mapping[str, Any]

    @property
    def storage_path(self) -> str:
        suffix = PurePosixPath(self.asset_path).suffix.lower()
        if not suffix:
            raise SeedError(f"{self.ref}: asset extension is missing")
        return f"{self.sha256}{suffix}"


@dataclass(frozen=True)
class CorpusEmbedding:
    object_ref: str
    image: Sequence[float]
    text: Sequence[float] | None


@dataclass(frozen=True)
class VerifiedCorpus:
    path: Path
    manifest: Mapping[str, Any]
    categories: Sequence[Mapping[str, Any]]
    objects: Sequence[CorpusObject]
    embeddings: Mapping[str, CorpusEmbedding]

    def selected(
        self, limit: int | None
    ) -> tuple[Sequence[CorpusObject], Mapping[str, CorpusEmbedding]]:
        objects = self.objects if limit is None else self.objects[:limit]
        embeddings = {obj.ref: self.embeddings[obj.ref] for obj in objects}
        return objects, embeddings


class CorpusRelease:
    """Own the pinned release download and cache."""

    def __init__(self, repository_root: Path) -> None:
        self._cache_dir = repository_root / ".tmp" / "opt-library" / RELEASE_TAG
        self.path = self._cache_dir / RELEASE_ASSET

    def download(self, refresh: bool = False) -> Path:
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        if self.path.exists() and not refresh:
            if sha256_file(self.path) == RELEASE_SHA256:
                print(f"Using cached corpus: {self.path}")
                return self.path
            print("Cached corpus checksum is stale; downloading it again.")

        partial = self.path.with_suffix(f"{self.path.suffix}.partial")
        if partial.exists():
            partial.unlink()

        print(f"Downloading {RELEASE_ASSET}…")
        request = urllib.request.Request(
            RELEASE_URL,
            headers={"User-Agent": "gridaco-grida-opt-library/1"},
        )
        try:
            with (
                urllib.request.urlopen(request, timeout=60) as response,
                partial.open("wb") as output,
            ):
                total = int(response.headers.get("Content-Length", "0"))
                received = 0
                while chunk := response.read(DOWNLOAD_CHUNK_BYTES):
                    output.write(chunk)
                    received += len(chunk)
                    print_download_progress(received, total)
        except (OSError, urllib.error.URLError) as error:
            if partial.exists():
                partial.unlink()
            raise SeedError(f"corpus download failed: {error}") from error

        digest = sha256_file(partial)
        if digest != RELEASE_SHA256:
            partial.unlink()
            raise SeedError(
                "downloaded corpus failed its pinned SHA-256 "
                f"(expected {RELEASE_SHA256}, got {digest})"
            )
        os.replace(partial, self.path)
        print(f"Downloaded corpus: {self.path}")
        return self.path


class CorpusArchive:
    """Verify archive integrity and materialize its portable records."""

    def verify(self, path: Path, *, require_pinned_sha: bool) -> VerifiedCorpus:
        if not path.is_file():
            raise SeedError(f"corpus archive does not exist: {path}")
        if require_pinned_sha:
            digest = sha256_file(path)
            if digest != RELEASE_SHA256:
                raise SeedError(
                    "corpus failed its pinned SHA-256 "
                    f"(expected {RELEASE_SHA256}, got {digest})"
                )

        try:
            with zipfile.ZipFile(path) as archive:
                self._verify_container(archive)
                manifest = self._read_json(archive, "manifest.json")
                self._verify_manifest(archive, manifest)
                categories = self._read_json(archive, "categories.json")
                raw_objects = self._read_jsonl(archive, "objects.jsonl")
                raw_embeddings = self._read_jsonl(archive, "embeddings.jsonl")
                objects = self._verify_objects(
                    archive, manifest, categories, raw_objects
                )
                embeddings = self._verify_embeddings(manifest, objects, raw_embeddings)
        except (
            OSError,
            zipfile.BadZipFile,
            UnicodeDecodeError,
            json.JSONDecodeError,
        ) as error:
            raise SeedError(f"corpus archive is invalid: {error}") from error

        print(
            "Verified corpus: "
            f"{manifest['category']['id']} "
            f"({len(objects)} objects, {len(embeddings)} embeddings)"
        )
        return VerifiedCorpus(
            path=path,
            manifest=manifest,
            categories=categories,
            objects=objects,
            embeddings=embeddings,
        )

    @staticmethod
    def _verify_container(archive: zipfile.ZipFile) -> None:
        infos = archive.infolist()
        if len(infos) > MAX_ARCHIVE_ENTRIES:
            raise SeedError("corpus archive has too many entries")
        if sum(info.file_size for info in infos) > MAX_EXPANDED_BYTES:
            raise SeedError("corpus archive is too large when expanded")

        names = [info.filename for info in infos]
        if len(names) != len(set(names)):
            raise SeedError("corpus archive contains duplicate paths")
        for info in infos:
            validate_archive_path(info.filename)
            if info.is_dir():
                raise SeedError("corpus archive must not contain directory entries")
            if info.filename.startswith("assets/") and info.file_size > MAX_ASSET_BYTES:
                raise SeedError(
                    f"{info.filename}: asset exceeds the local bucket limit"
                )
        if not REQUIRED_ENTRIES.issubset(names):
            missing = ", ".join(sorted(REQUIRED_ENTRIES - set(names)))
            raise SeedError(f"corpus archive is missing: {missing}")

    def _verify_manifest(
        self, archive: zipfile.ZipFile, manifest: Mapping[str, Any]
    ) -> None:
        if (
            manifest.get("format") != FORMAT
            or manifest.get("format_version") != FORMAT_VERSION
        ):
            raise SeedError("corpus archive format is unsupported")
        if manifest.get("asset_addressing") != {
            "algorithm": "sha256",
            "path_template": "assets/{sha256}.{ext}",
        }:
            raise SeedError("corpus asset-addressing contract is unsupported")

        embedding = manifest.get("embedding")
        expected_embedding = {
            "model": EMBEDDING_MODEL,
            "dimensions": EMBEDDING_DIMENSIONS,
            "metric": "cosine",
            "normalized": True,
            "image_column": "gemini_embedding_2__image",
            "image_required": True,
            "text_column": "gemini_embedding_2__text",
            "text_optional": True,
        }
        if embedding != expected_embedding:
            raise SeedError("corpus embedding contract does not match Grida")

        inventory = manifest.get("files")
        if not isinstance(inventory, dict):
            raise SeedError("corpus file inventory is missing")
        expected_names = set(inventory) | {"manifest.json"}
        if expected_names != set(archive.namelist()):
            raise SeedError("corpus entries do not match its manifest")

        print("Verifying archive inventory…")
        for name, record in inventory.items():
            if not isinstance(record, dict):
                raise SeedError(f"{name}: inventory record is invalid")
            expected_bytes = record.get("bytes")
            expected_digest = record.get("sha256")
            if not isinstance(expected_bytes, int) or not is_sha256(expected_digest):
                raise SeedError(f"{name}: inventory record is invalid")
            info = archive.getinfo(name)
            if info.file_size != expected_bytes:
                raise SeedError(f"{name}: byte size does not match the manifest")
            if sha256_archive_entry(archive, name) != expected_digest:
                raise SeedError(f"{name}: SHA-256 does not match the manifest")

    @staticmethod
    def _verify_objects(
        archive: zipfile.ZipFile,
        manifest: Mapping[str, Any],
        categories: Any,
        records: Sequence[Mapping[str, Any]],
    ) -> Sequence[CorpusObject]:
        if not isinstance(categories, list) or not categories:
            raise SeedError("corpus categories are invalid")
        category_ids = {
            record.get("id")
            for record in categories
            if isinstance(record, dict) and isinstance(record.get("id"), str)
        }
        category = manifest.get("category")
        if not isinstance(category, dict) or category.get("id") not in category_ids:
            raise SeedError("corpus category does not match categories.json")
        if manifest.get("object_count") != len(records):
            raise SeedError("corpus object count does not match its manifest")

        seen_refs: set[str] = set()
        license_counts: dict[str, int] = {}
        objects: list[CorpusObject] = []
        for record in records:
            if set(record) != {"ref", "sha256", "asset_path", "metadata"}:
                raise SeedError("corpus object record has unsupported fields")
            ref = record.get("ref")
            digest = record.get("sha256")
            asset_path = record.get("asset_path")
            metadata = record.get("metadata")
            if (
                not isinstance(ref, str)
                or not is_sha256(digest)
                or ref != f"sha256:{digest}"
                or not isinstance(asset_path, str)
                or not isinstance(metadata, dict)
            ):
                raise SeedError("corpus object identity is invalid")
            if ref in seen_refs:
                raise SeedError(f"{ref}: duplicate object reference")
            seen_refs.add(ref)
            validate_archive_path(asset_path)
            if not asset_path.startswith(f"assets/{digest}."):
                raise SeedError(f"{ref}: asset path is not content-addressed")
            if metadata.get("category") not in category_ids:
                raise SeedError(f"{ref}: category is not declared")
            try:
                info = archive.getinfo(asset_path)
                if metadata.get("bytes") != info.file_size:
                    raise SeedError(f"{ref}: asset byte size is invalid")
                if sha256_archive_entry(archive, asset_path) != digest:
                    raise SeedError(f"{ref}: asset bytes do not match their address")
            except KeyError as error:
                raise SeedError(
                    f"{ref}: asset is missing from the corpus archive"
                ) from error
            if not OBJECT_METADATA_FIELDS.issuperset(metadata):
                raise SeedError(f"{ref}: object metadata has unsupported fields")
            license_id = metadata.get("license")
            if license_id not in SUPPORTED_LICENSES:
                raise SeedError(f"{ref}: object license is unsupported")
            license_counts[license_id] = license_counts.get(license_id, 0) + 1
            objects.append(
                CorpusObject(
                    ref=ref,
                    sha256=digest,
                    asset_path=asset_path,
                    metadata=metadata,
                )
            )
        if manifest.get("licenses") != dict(sorted(license_counts.items())):
            raise SeedError("corpus license counts do not match its objects")
        return objects

    @staticmethod
    def _verify_embeddings(
        manifest: Mapping[str, Any],
        objects: Sequence[CorpusObject],
        records: Sequence[Mapping[str, Any]],
    ) -> Mapping[str, CorpusEmbedding]:
        if manifest.get("object_count") != len(records):
            raise SeedError("corpus embedding count does not match its objects")
        object_refs = {obj.ref for obj in objects}
        embeddings: dict[str, CorpusEmbedding] = {}
        for record in records:
            if set(record) != {"object_ref", "image", "text"}:
                raise SeedError("corpus embedding record has unsupported fields")
            object_ref = record.get("object_ref")
            image = record.get("image")
            text = record.get("text")
            if not isinstance(object_ref, str) or object_ref not in object_refs:
                raise SeedError("corpus embedding references an unknown object")
            if object_ref in embeddings:
                raise SeedError(f"{object_ref}: duplicate embedding")
            validate_vector(image, f"{object_ref} image")
            if text is not None:
                validate_vector(text, f"{object_ref} text")
            embeddings[object_ref] = CorpusEmbedding(
                object_ref=object_ref,
                image=image,
                text=text,
            )
        if set(embeddings) != object_refs:
            raise SeedError("corpus embeddings do not cover every object")
        return embeddings

    @staticmethod
    def _read_json(archive: zipfile.ZipFile, name: str) -> Any:
        return json.loads(archive.read(name).decode("utf-8"))

    @staticmethod
    def _read_jsonl(archive: zipfile.ZipFile, name: str) -> Sequence[Mapping[str, Any]]:
        records: list[Mapping[str, Any]] = []
        for line in archive.read(name).decode("utf-8").splitlines():
            record = json.loads(line)
            if not isinstance(record, dict):
                raise SeedError(f"{name}: record is not an object")
            records.append(record)
        return records


@dataclass(frozen=True)
class LocalSupabaseConfig:
    """The only local destinations this checkout permits."""

    api_port: int
    db_port: int
    api_tls: bool

    @classmethod
    def load(cls, repository_root: Path) -> LocalSupabaseConfig:
        path = repository_root / "supabase" / "config.toml"
        try:
            with path.open("rb") as source:
                config = tomllib.load(source)
        except (OSError, tomllib.TOMLDecodeError) as error:
            raise SeedError(f"local Supabase config is invalid: {error}") from error

        api = required_mapping(config, "api", "local Supabase config")
        database = required_mapping(config, "db", "local Supabase config")
        tls = api.get("tls", {})
        if not isinstance(tls, Mapping):
            raise SeedError("local Supabase config api.tls must be a table")
        tls_enabled = tls.get("enabled", False)
        if not isinstance(tls_enabled, bool):
            raise SeedError("local Supabase config api.tls.enabled must be a boolean")
        return cls(
            api_port=required_port(api, "port", "local Supabase API"),
            db_port=required_port(database, "port", "local Supabase database"),
            api_tls=tls_enabled,
        )

    @property
    def api_origin(self) -> str:
        scheme = "https" if self.api_tls else "http"
        return f"{scheme}://127.0.0.1:{self.api_port}"

    def require_api_url(self, value: str) -> None:
        if value not in {self.api_origin, f"{self.api_origin}/"}:
            raise SeedError(
                "Supabase API does not match this checkout's exact "
                f"local endpoint ({self.api_origin}); refusing to seed it"
            )

    def require_db_url(self, value: str) -> None:
        try:
            parsed = urllib.parse.urlsplit(value)
            port = parsed.port
        except ValueError as error:
            raise SeedError(
                "Supabase database URL is malformed; refusing to seed it"
            ) from error
        if (
            parsed.scheme not in {"postgres", "postgresql"}
            or parsed.hostname != "127.0.0.1"
            or port != self.db_port
            or parsed.username != "postgres"
            or parsed.path != "/postgres"
            or parsed.query
            or parsed.fragment
        ):
            raise SeedError(
                "Supabase database does not match this checkout's exact "
                "local endpoint "
                f"(postgresql://postgres:***@127.0.0.1:{self.db_port}/postgres); "
                "refusing to seed it"
            )


@dataclass(frozen=True)
class LocalSupabaseStatus:
    api_url: str
    db_url: str
    service_role_key: str
    config: LocalSupabaseConfig

    def require_local(self) -> None:
        self.config.require_api_url(self.api_url)
        self.config.require_db_url(self.db_url)

    @classmethod
    def discover(cls, repository_root: Path) -> LocalSupabaseStatus:
        config = LocalSupabaseConfig.load(repository_root)
        if shutil.which("psql") is None:
            raise SeedError("PostgreSQL psql is not installed")
        try:
            result = subprocess.run(
                ["supabase", "status", "-o", "json"],
                cwd=repository_root,
                check=True,
                capture_output=True,
                text=True,
            )
        except FileNotFoundError as error:
            raise SeedError("Supabase CLI is not installed") from error
        except subprocess.CalledProcessError as error:
            detail = error.stderr.strip() or error.stdout.strip()
            raise SeedError(
                "local Supabase is not running; run `supabase start` first"
                + (f" ({detail})" if detail else "")
            ) from error

        try:
            status = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise SeedError("Supabase CLI returned invalid local status") from error

        api_url = required_string(status, "API_URL")
        db_url = required_string(status, "DB_URL")
        config.require_api_url(api_url)
        config.require_db_url(db_url)
        service_role_key = required_string(status, "SERVICE_ROLE_KEY")
        return cls(
            api_url=api_url.rstrip("/"),
            db_url=db_url,
            service_role_key=service_role_key,
            config=config,
        )


class LocalLibrary:
    """Write a verified corpus to local Storage and the local database."""

    def __init__(self, status: LocalSupabaseStatus) -> None:
        status.require_local()
        self._api_url = status.api_url
        self._db_url = status.db_url
        self._key = status.service_role_key
        # Local service-role requests must never inherit system proxy settings
        # or follow redirects away from the validated loopback endpoint.
        self._local_opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            LocalOnlyRedirectHandler(),
        )

    def seed(
        self,
        corpus: VerifiedCorpus,
        objects: Sequence[CorpusObject],
        embeddings: Mapping[str, CorpusEmbedding],
    ) -> None:
        existing_by_sha = self._existing_objects()
        catalog_ids: dict[str, str] = {}
        storage_paths: dict[str, str] = {}
        object_rows: list[Mapping[str, Any]] = []

        with zipfile.ZipFile(corpus.path) as archive:
            for index, obj in enumerate(objects, start=1):
                existing = existing_by_sha.get(obj.sha256)
                if existing:
                    catalog_id = required_string(existing, "id")
                    storage_path = required_string(existing, "path")
                else:
                    asset = archive.read(obj.asset_path)
                    catalog_id = self._upload(
                        obj.storage_path,
                        asset,
                        required_string(obj.metadata, "mimetype"),
                    )
                    storage_path = obj.storage_path
                catalog_ids[obj.ref] = catalog_id
                storage_paths[obj.ref] = storage_path
                object_rows.append(self._object_row(obj, catalog_id, storage_path))
                print(
                    f"\rPreparing objects: {index}/{len(objects)}", end="", flush=True
                )
        if objects:
            print()

        embedding_rows: list[Mapping[str, Any]] = []
        for obj in objects:
            embedding = embeddings[obj.ref]
            embedding_rows.append(
                {
                    "object_id": catalog_ids[obj.ref],
                    "gemini_embedding_2__image": vector_literal(embedding.image),
                    "gemini_embedding_2__text": (
                        vector_literal(embedding.text)
                        if embedding.text is not None
                        else None
                    ),
                }
            )

        self._import_database(corpus.categories, object_rows, embedding_rows)
        if objects:
            first = objects[0]
            self._verify_public_asset(
                storage_paths[first.ref],
                first.sha256,
            )
        print(f"Seeded {len(objects)} Library objects into local Supabase.")

    @staticmethod
    def _category_rows(
        categories: Sequence[Mapping[str, Any]],
    ) -> Sequence[Mapping[str, Any]]:
        return [
            {
                "id": required_string(category, "id"),
                "name": required_string(category, "name"),
                "description": category.get("description"),
            }
            for category in categories
        ]

    def _existing_objects(self) -> Mapping[str, Mapping[str, Any]]:
        rows: list[Mapping[str, Any]] = []
        offset = 0
        while True:
            page = self._request_json(
                "GET",
                "/rest/v1/object"
                "?select=id,path,sha256"
                "&sha256=not.is.null"
                f"&limit=5000&offset={offset}",
                schema="grida_library",
            )
            if not isinstance(page, list) or not all(
                isinstance(row, dict) for row in page
            ):
                raise SeedError(
                    "local Library object query returned an invalid response"
                )
            rows.extend(page)
            if len(page) < 5_000:
                break
            offset += len(page)
        return {
            row["sha256"]: row
            for row in rows
            if isinstance(row, dict) and is_sha256(row.get("sha256"))
        }

    def _upload(self, path: str, payload: bytes, mimetype: str) -> str:
        encoded_path = urllib.parse.quote(f"library/{path}", safe="/")
        response = self._request_json(
            "POST",
            f"/storage/v1/object/{encoded_path}",
            body=payload,
            headers={
                "Content-Type": mimetype,
                "Cache-Control": "max-age=3600",
                "x-upsert": "true",
            },
        )
        if not isinstance(response, dict):
            raise SeedError(f"{path}: local Storage returned an invalid response")
        storage_id = response.get("Id") or response.get("id")
        if not isinstance(storage_id, str) or not storage_id:
            raise SeedError(f"{path}: local Storage did not return an object ID")
        return storage_id

    @staticmethod
    def _object_row(
        obj: CorpusObject, catalog_id: str, storage_path: str
    ) -> Mapping[str, Any]:
        row = {
            key: value
            for key, value in obj.metadata.items()
            if key in OBJECT_METADATA_FIELDS
        }
        row.update(
            {
                "id": catalog_id,
                "path": storage_path,
                "sha256": obj.sha256,
            }
        )
        return row

    def _import_database(
        self,
        categories: Sequence[Mapping[str, Any]],
        objects: Sequence[Mapping[str, Any]],
        embeddings: Sequence[Mapping[str, Any]],
    ) -> None:
        sql = build_import_sql(
            self._category_rows(categories),
            objects,
            embeddings,
        )
        try:
            subprocess.run(
                [
                    "psql",
                    self._db_url,
                    "-X",
                    "-q",
                    "-v",
                    "ON_ERROR_STOP=1",
                ],
                input=sql,
                check=True,
                capture_output=True,
                text=True,
                # libpq accepts connection-affecting PG* environment defaults
                # in addition to the validated URI (notably PGHOSTADDR). Strip
                # the whole namespace so the URI remains the sole authority.
                env={
                    key: value
                    for key, value in os.environ.items()
                    if not key.upper().startswith("PG")
                },
            )
        except FileNotFoundError as error:
            raise SeedError("PostgreSQL psql is not installed") from error
        except subprocess.CalledProcessError as error:
            detail = error.stderr.strip() or error.stdout.strip()
            raise SeedError(
                "local Library database import failed"
                + (f": {detail}" if detail else "")
            ) from error

    def _verify_public_asset(self, path: str, expected_sha256: str) -> None:
        encoded_path = urllib.parse.quote(f"library/{path}", safe="/")
        request = urllib.request.Request(
            f"{self._api_url}/storage/v1/object/public/{encoded_path}",
            headers={"User-Agent": "gridaco-grida-opt-library/1"},
        )
        try:
            with self._local_opener.open(request, timeout=60) as response:
                digest = hashlib.sha256(response.read()).hexdigest()
        except (urllib.error.URLError, OSError) as error:
            raise SeedError(
                f"seeded public asset could not be read ({path}): {error}"
            ) from error
        if digest != expected_sha256:
            raise SeedError(f"seeded public asset failed verification: {path}")

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        body: bytes | None = None,
        schema: str | None = None,
        headers: Mapping[str, str] | None = None,
        expect_json: bool = True,
    ) -> Any:
        request_headers = {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
        }
        if schema:
            request_headers[
                "Accept-Profile" if method == "GET" else "Content-Profile"
            ] = schema
        if headers:
            request_headers.update(headers)
        request = urllib.request.Request(
            f"{self._api_url}{path}",
            data=body,
            headers=request_headers,
            method=method,
        )
        try:
            with self._local_opener.open(request, timeout=60) as response:
                payload = response.read()
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise SeedError(
                f"local Supabase request failed ({error.code} {path}): {detail}"
            ) from error
        except urllib.error.URLError as error:
            raise SeedError(
                f"local Supabase request failed ({path}): {error}"
            ) from error
        if not expect_json or not payload:
            return None
        try:
            return json.loads(payload)
        except json.JSONDecodeError as error:
            raise SeedError(
                f"local Supabase returned invalid JSON for {path}"
            ) from error


def repository_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "supabase" / "config.toml").is_file() and (
            parent / ".git"
        ).exists():
            return parent
    raise SeedError("run this script from a gridaco/grida checkout")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(DOWNLOAD_CHUNK_BYTES):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_archive_entry(archive: zipfile.ZipFile, name: str) -> str:
    digest = hashlib.sha256()
    with archive.open(name) as source:
        while chunk := source.read(DOWNLOAD_CHUNK_BYTES):
            digest.update(chunk)
    return digest.hexdigest()


def validate_archive_path(value: str) -> None:
    path = PurePosixPath(value)
    if (
        not value
        or value.startswith("/")
        or "\\" in value
        or path.is_absolute()
        or ".." in path.parts
        or "." in path.parts
    ):
        raise SeedError(f"unsafe archive path: {value!r}")


def is_sha256(value: Any) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
    )


def validate_vector(value: Any, name: str) -> None:
    if not isinstance(value, list) or len(value) != EMBEDDING_DIMENSIONS:
        raise SeedError(f"{name}: expected {EMBEDDING_DIMENSIONS} dimensions")
    if not all(
        isinstance(component, (int, float))
        and not isinstance(component, bool)
        and math.isfinite(component)
        for component in value
    ):
        raise SeedError(f"{name}: vector contains a non-finite component")
    norm = math.sqrt(sum(component * component for component in value))
    if not math.isclose(norm, 1.0, rel_tol=0.0, abs_tol=0.002):
        raise SeedError(f"{name}: vector is not L2-normalized")


def vector_literal(value: Sequence[float]) -> str:
    return json.dumps(value, separators=(",", ":"))


def required_string(record: Mapping[str, Any], key: str) -> str:
    value = record.get(key)
    if not isinstance(value, str) or not value:
        raise SeedError(f"required string is missing: {key}")
    return value


def required_mapping(
    record: Mapping[str, Any], key: str, label: str
) -> Mapping[str, Any]:
    value = record.get(key)
    if not isinstance(value, Mapping):
        raise SeedError(f"{label} {key} must be a table")
    return value


def required_port(record: Mapping[str, Any], key: str, label: str) -> int:
    value = record.get(key)
    if (
        not isinstance(value, int)
        or isinstance(value, bool)
        or value < 1
        or value > 65_535
    ):
        raise SeedError(f"{label} {key} must be a valid TCP port")
    return value


def sql_json_values(rows: Sequence[Mapping[str, Any]]) -> str:
    if not rows:
        return "(NULL::jsonb)"
    return ",\n".join(
        f"({sql_literal(json.dumps(row, separators=(',', ':')))}::jsonb)"
        for row in rows
    )


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def build_import_sql(
    categories: Sequence[Mapping[str, Any]],
    objects: Sequence[Mapping[str, Any]],
    embeddings: Sequence[Mapping[str, Any]],
) -> str:
    return f"""
\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL client_min_messages = warning;
SET LOCAL standard_conforming_strings = on;

CREATE TEMP TABLE opt_library_categories (payload jsonb) ON COMMIT DROP;
INSERT INTO opt_library_categories(payload) VALUES
{sql_json_values(categories)};

CREATE TEMP TABLE opt_library_objects (payload jsonb) ON COMMIT DROP;
INSERT INTO opt_library_objects(payload) VALUES
{sql_json_values(objects)};

CREATE TEMP TABLE opt_library_embeddings (payload jsonb) ON COMMIT DROP;
INSERT INTO opt_library_embeddings(payload) VALUES
{sql_json_values(embeddings)};

INSERT INTO grida_library.category (id, name, description)
SELECT row.id, row.name, row.description
FROM opt_library_categories source
CROSS JOIN LATERAL jsonb_to_record(source.payload) AS row(
  id text,
  name text,
  description text
)
WHERE source.payload IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- The archive already contains final representations. Suppress only the
-- enrichment-enqueue trigger during this local transaction; all integrity
-- triggers remain enabled, and rollback restores trigger state on failure.
ALTER TABLE grida_library.object
  DISABLE TRIGGER enqueue_object_embedding_on_insert;

INSERT INTO grida_library.object (
  id,
  path,
  sha256,
  title,
  alt,
  description,
  category,
  categories,
  objects,
  keywords,
  mimetype,
  width,
  height,
  bytes,
  license,
  version,
  fill,
  color,
  colors,
  background,
  score,
  year,
  entropy,
  orientation,
  gravity_x,
  gravity_y,
  lang,
  transparency,
  public_domain
)
SELECT
  row.id,
  row.path,
  row.sha256,
  row.title,
  row.alt,
  row.description,
  row.category,
  row.categories,
  row.objects,
  row.keywords,
  row.mimetype,
  row.width,
  row.height,
  row.bytes,
  row.license,
  row.version,
  row.fill,
  row.color,
  row.colors,
  row.background,
  row.score,
  row.year,
  row.entropy,
  row.orientation,
  row.gravity_x,
  row.gravity_y,
  row.lang,
  row.transparency,
  row.public_domain
FROM opt_library_objects source
CROSS JOIN LATERAL jsonb_to_record(source.payload) AS row(
  id uuid,
  path text,
  sha256 text,
  title text,
  alt text,
  description text,
  category text,
  categories grida_library.label[],
  objects text[],
  keywords text[],
  mimetype text,
  width int,
  height int,
  bytes int,
  license text,
  version int,
  fill text,
  color grida_library.color,
  colors grida_library.color[],
  background grida_library.color,
  score numeric,
  year int,
  entropy numeric,
  orientation grida_library.orientation,
  gravity_x numeric,
  gravity_y numeric,
  lang grida_library.lang,
  transparency boolean,
  public_domain boolean
)
WHERE source.payload IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
  path = EXCLUDED.path,
  sha256 = EXCLUDED.sha256,
  title = EXCLUDED.title,
  alt = EXCLUDED.alt,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  categories = EXCLUDED.categories,
  objects = EXCLUDED.objects,
  keywords = EXCLUDED.keywords,
  mimetype = EXCLUDED.mimetype,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  bytes = EXCLUDED.bytes,
  license = EXCLUDED.license,
  version = EXCLUDED.version,
  fill = EXCLUDED.fill,
  color = EXCLUDED.color,
  colors = EXCLUDED.colors,
  background = EXCLUDED.background,
  score = EXCLUDED.score,
  year = EXCLUDED.year,
  entropy = EXCLUDED.entropy,
  orientation = EXCLUDED.orientation,
  gravity_x = EXCLUDED.gravity_x,
  gravity_y = EXCLUDED.gravity_y,
  lang = EXCLUDED.lang,
  transparency = EXCLUDED.transparency,
  public_domain = EXCLUDED.public_domain,
  updated_at = now();

ALTER TABLE grida_library.object
  ENABLE TRIGGER enqueue_object_embedding_on_insert;

INSERT INTO grida_library.object_embedding (
  object_id,
  gemini_embedding_2__image,
  gemini_embedding_2__text
)
SELECT
  (source.payload->>'object_id')::uuid,
  (source.payload->>'gemini_embedding_2__image')::vector(1536),
  (source.payload->>'gemini_embedding_2__text')::vector(1536)
FROM opt_library_embeddings source
WHERE source.payload IS NOT NULL
ON CONFLICT (object_id) DO UPDATE SET
  gemini_embedding_2__image = EXCLUDED.gemini_embedding_2__image,
  gemini_embedding_2__text = EXCLUDED.gemini_embedding_2__text;

DO $verify$
DECLARE
  missing_objects int;
  missing_embeddings int;
BEGIN
  SELECT count(*) INTO missing_objects
  FROM opt_library_objects source
  LEFT JOIN grida_library.object target
    ON target.id = (source.payload->>'id')::uuid
   AND target.sha256 = source.payload->>'sha256'
   AND target.path = source.payload->>'path'
  WHERE source.payload IS NOT NULL
    AND target.id IS NULL;

  SELECT count(*) INTO missing_embeddings
  FROM opt_library_embeddings source
  LEFT JOIN grida_library.object_embedding target
    ON target.object_id = (source.payload->>'object_id')::uuid
  WHERE source.payload IS NOT NULL
    AND (
      target.object_id IS NULL
      OR target.gemini_embedding_2__image IS NULL
    );

  IF missing_objects <> 0 OR missing_embeddings <> 0 THEN
    RAISE EXCEPTION
      'opt-library verification failed: % objects, % embeddings missing',
      missing_objects,
      missing_embeddings;
  END IF;
END
$verify$;

COMMIT;
"""


def print_download_progress(received: int, total: int) -> None:
    if total:
        percent = received / total * 100
        print(
            f"\rDownloaded {received / 1024 / 1024:.1f} MiB "
            f"of {total / 1024 / 1024:.1f} MiB ({percent:.0f}%)",
            end="",
            flush=True,
        )
    else:
        print(
            f"\rDownloaded {received / 1024 / 1024:.1f} MiB",
            end="",
            flush=True,
        )
    if total and received >= total:
        print()


def resolve_archive(
    release: CorpusRelease, archive: Path | None, *, refresh: bool
) -> tuple[Path, bool]:
    if archive is not None:
        return archive.expanduser().resolve(), False
    return release.download(refresh=refresh), True


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Seed the optional Grida Library developer corpus locally."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    download = subparsers.add_parser(
        "download", help="Download and verify the pinned corpus release."
    )
    download.add_argument("--refresh", action="store_true")

    verify = subparsers.add_parser(
        "verify", help="Verify the pinned or explicitly supplied archive."
    )
    verify.add_argument("--archive", type=Path)
    verify.add_argument("--refresh", action="store_true")

    seed = subparsers.add_parser(
        "seed", help="Download, verify, and seed local Supabase."
    )
    seed.add_argument("--archive", type=Path)
    seed.add_argument("--refresh", action="store_true")
    seed.add_argument(
        "--limit",
        type=int,
        help="Seed only the first N deterministic objects for a smoke test.",
    )
    return parser


def run(arguments: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(arguments)
    root = repository_root()
    release = CorpusRelease(root)
    verifier = CorpusArchive()
    status: LocalSupabaseStatus | None = None
    limit: int | None = None

    if args.command == "download":
        path = release.download(refresh=args.refresh)
        verifier.verify(path, require_pinned_sha=True)
        return 0

    if args.command == "seed":
        limit = args.limit
        if limit is not None and limit < 1:
            raise SeedError("--limit must be at least 1")
        status = LocalSupabaseStatus.discover(root)

    path, pinned = resolve_archive(
        release,
        args.archive,
        refresh=args.refresh,
    )
    corpus = verifier.verify(path, require_pinned_sha=pinned)
    if args.command == "verify":
        return 0

    objects, embeddings = corpus.selected(limit)
    if status is None:
        raise SeedError("local Supabase status was not initialized")
    LocalLibrary(status).seed(corpus, objects, embeddings)
    return 0


def main() -> None:
    try:
        raise SystemExit(run())
    except SeedError as error:
        print(f"opt-library: {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
