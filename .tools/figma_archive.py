#!/usr/bin/env python3
# https://gist.github.com/softmarshmallow/27ad65dfa5babc2c67b41740f1f05791
"""
Archive a Figma file via REST API: document.json (with geometry) and images/*.

Stdlib only. Usage:

  python .tools/figma_archive.py --filekey <key> --archive-dir <dir> [--x-figma-token <token>]
  # or set FIGMA_TOKEN in the environment

Output layout:
  <archive-dir>/document.json   — GET /v1/files/:key?geometry=paths
  <archive-dir>/images/<ref>.<ext>  — from GET /v1/files/:key/images, then download each URL
"""

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

FIGMA_BASE = "https://api.figma.com"
ENV_TOKEN = "FIGMA_TOKEN"

# Content-Type -> file extension for image fills
MIME_EXT = {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
}


def get_token(flag_value: str | None) -> str:
    token = flag_value or os.environ.get(ENV_TOKEN)
    if not token or not token.strip():
        print(f"error: provide --x-figma-token or set {ENV_TOKEN}", file=sys.stderr)
        sys.exit(1)
    return token.strip()


def api_get(url: str, token: str) -> bytes:
    req = Request(url, method="GET", headers={"X-Figma-Token": token})
    try:
        with urlopen(req, timeout=60) as resp:
            return resp.read()
    except HTTPError as e:
        print(f"error: HTTP {e.code} {e.reason}: {url}", file=sys.stderr)
        if e.fp:
            body = e.fp.read().decode("utf-8", errors="replace")[:500]
            print(body, file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"error: request failed: {e.reason}", file=sys.stderr)
        sys.exit(1)


def fetch_document(file_key: str, token: str) -> dict:
    url = f"{FIGMA_BASE}/v1/files/{file_key}?geometry=paths"
    raw = api_get(url, token)
    return json.loads(raw.decode("utf-8"))


def fetch_image_fills(file_key: str, token: str) -> dict[str, str]:
    url = f"{FIGMA_BASE}/v1/files/{file_key}/images"
    raw = api_get(url, token)
    data = json.loads(raw.decode("utf-8"))
    meta = data.get("meta") or {}
    images = meta.get("images") or {}
    return {k: v for k, v in images.items() if v}


def download_image(url: str) -> tuple[bytes, str]:
    # Image URLs from the Images API are pre-signed; no token needed.
    req = Request(url, method="GET")
    with urlopen(req, timeout=120) as resp:
        data = resp.read()
        content_type = (
            (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        )
        ext = MIME_EXT.get(content_type) or "png"
        return data, ext


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Archive a Figma file (document.json + images/) via REST API."
    )
    parser.add_argument(
        "--x-figma-token",
        metavar="TOKEN",
        default=None,
        help=f"Figma personal access token (or set {ENV_TOKEN})",
    )
    parser.add_argument("--filekey", required=True, help="Figma file key")
    parser.add_argument(
        "--archive-dir",
        required=True,
        type=Path,
        help="Output directory (document.json and images/ will be written here)",
    )
    args = parser.parse_args()

    token = get_token(args.x_figma_token)
    archive_dir = args.archive_dir.resolve()
    file_key = args.filekey.strip()

    archive_dir.mkdir(parents=True, exist_ok=True)
    images_dir = archive_dir / "images"
    images_dir.mkdir(exist_ok=True)

    print("Fetching document (geometry=paths)...", flush=True)
    doc = fetch_document(file_key, token)
    document_path = archive_dir / "document.json"
    with open(document_path, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
    doc_size = document_path.stat().st_size
    print(f"Wrote document.json ({doc_size:,} bytes)", flush=True)

    print("Fetching image fills list...", flush=True)
    ref_to_url = fetch_image_fills(file_key, token)
    n_images = len(ref_to_url)
    if not ref_to_url:
        print("No image fills.", flush=True)
        return

    print(f"Downloading {n_images} image(s)...", flush=True)
    total_bytes = 0
    ok = 0
    for i, (ref, url) in enumerate(ref_to_url.items(), 1):
        # Ref can contain characters unsafe for filenames; sanitize to alphanumeric + underscore
        safe_ref = "".join(c if c.isalnum() or c in "._-" else "_" for c in ref)
        if not safe_ref:
            safe_ref = f"ref_{i}"
        try:
            data, ext = download_image(url)
            out_path = images_dir / f"{safe_ref}.{ext}"
            out_path.write_bytes(data)
            size_k = len(data) / 1024
            total_bytes += len(data)
            ok += 1
            print(f"  [{i}/{n_images}] {safe_ref}.{ext} ({size_k:.1f} KB)", flush=True)
        except Exception as e:
            print(f"  [{i}/{n_images}] {safe_ref} — failed: {e}", file=sys.stderr)

    total_mb = total_bytes / (1024 * 1024)
    print(
        f"Done. document.json ({doc_size:,} B) + {ok}/{n_images} images ({total_mb:.2f} MB) in {archive_dir}.",
        flush=True,
    )


if __name__ == "__main__":
    main()
