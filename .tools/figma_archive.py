#!/usr/bin/env python3
# https://gist.github.com/softmarshmallow/27ad65dfa5babc2c67b41740f1f05791
"""
Archive a Figma file via the REST API and optionally export node renderings.

Stdlib only — no third-party dependencies.

Usage
-----
  export FIGMA_TOKEN=<your-token>          # or pass --x-figma-token

  # Archive only (document + image fills)
  python figma_archive.py --filekey <key> --archive-dir <dir>

  # Archive + export nodes that have Figma export presets
  python figma_archive.py --filekey <key> --archive-dir <dir> --export

Output layout
-------------
  <archive-dir>/
  ├── document.json        GET /v1/files/:key?geometry=paths
  ├── images/<ref>.<ext>   Image fills from GET /v1/files/:key/images
  └── exports/<id>.png     (--export only) Node renderings via GET /v1/images/:key

--export behaviour
------------------
Walks the fetched document.json tree, collects every node whose
``exportSettings`` array is non-empty, then calls the Figma Images API
(``GET /v1/images/:key?ids=…``) to render them. Large ID lists are
automatically chunked into multiple requests to stay within URL length
limits.

Nodes must have export presets configured **in Figma** before archiving
(select a node → right panel → Export +). The REST API does not include
``exportSettings`` for SECTION nodes (figma/rest-api-spec#87) — use
FRAME, COMPONENT, or INSTANCE nodes instead.
"""

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

FIGMA_BASE = "https://api.figma.com"
ENV_TOKENS = ("FIGMA_TOKEN", "X_FIGMA_TOKEN")

# Content-Type -> file extension for image fills
MIME_EXT = {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
}


def get_token(flag_value: str | None) -> str:
    token = flag_value
    if not token:
        for env in ENV_TOKENS:
            token = os.environ.get(env)
            if token and token.strip():
                break
    if not token or not token.strip():
        names = " or ".join(ENV_TOKENS)
        print(f"error: provide --x-figma-token or set {names}", file=sys.stderr)
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


def collect_export_node_ids(node: dict) -> list[str]:
    """Walk the document tree and return IDs of nodes that have exportSettings."""
    result = []
    settings = node.get("exportSettings")
    if settings and len(settings) > 0:
        nid = node.get("id")
        if nid:
            result.append(nid)
    for child in node.get("children") or []:
        result.extend(collect_export_node_ids(child))
    return result


# Maximum URL length to stay safely under server/proxy limits.
# Most HTTP stacks support ~8 KB; we use 4 KB to leave room for the base URL,
# file key, and other query parameters.
_MAX_IDS_QUERY_LEN = 4000


def chunk_node_ids(
    node_ids: list[str], max_len: int = _MAX_IDS_QUERY_LEN
) -> list[list[str]]:
    """Split node IDs into chunks whose comma-joined string fits within *max_len*."""
    chunks: list[list[str]] = []
    current: list[str] = []
    current_len = 0
    for nid in node_ids:
        # +1 for the comma separator (except for the first item)
        addition = len(nid) + (1 if current else 0)
        if current and current_len + addition > max_len:
            chunks.append(current)
            current = [nid]
            current_len = len(nid)
        else:
            current.append(nid)
            current_len += addition
    if current:
        chunks.append(current)
    return chunks


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Archive a Figma file via REST API and optionally export node renderings."
    )
    parser.add_argument(
        "--x-figma-token",
        metavar="TOKEN",
        default=None,
        help="Figma personal access token (or set FIGMA_TOKEN / X_FIGMA_TOKEN)",
    )
    parser.add_argument("--filekey", required=True, help="Figma file key")
    parser.add_argument(
        "--archive-dir",
        required=True,
        type=Path,
        help="Output directory (document.json and images/ will be written here)",
    )
    parser.add_argument(
        "--export",
        action="store_true",
        default=False,
        help="Export nodes with Figma exportSettings as PNGs via the Images API (written to <archive-dir>/exports/).",
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
    else:
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
                print(
                    f"  [{i}/{n_images}] {safe_ref}.{ext} ({size_k:.1f} KB)", flush=True
                )
            except Exception as e:
                print(f"  [{i}/{n_images}] {safe_ref} — failed: {e}", file=sys.stderr)

        total_mb = total_bytes / (1024 * 1024)
        print(
            f"Done. document.json ({doc_size:,} B) + {ok}/{n_images} images ({total_mb:.2f} MB) in {archive_dir}.",
            flush=True,
        )

    # --- Export node renderings via the Images API ---
    if args.export:
        doc_root = doc.get("document") or doc
        node_ids = collect_export_node_ids(doc_root)
        if not node_ids:
            print("No nodes with exportSettings found; skipping export.", flush=True)
            return

        export_dir = archive_dir / "exports"
        export_dir.mkdir(exist_ok=True)

        chunks = chunk_node_ids(node_ids)
        print(
            f"Exporting {len(node_ids)} node(s) with exportSettings via Images API"
            f" ({len(chunks)} request(s))...",
            flush=True,
        )

        exported = 0
        for chunk in chunks:
            ids_param = ",".join(chunk)
            export_url = f"{FIGMA_BASE}/v1/images/{file_key}?ids={ids_param}"
            raw = api_get(export_url, token)
            resp = json.loads(raw.decode("utf-8"))
            url_map = resp.get("images") or {}

            for nid in chunk:
                img_url = url_map.get(nid)
                if not img_url:
                    print(
                        f"  warning: no image URL for node {nid}, skipping",
                        file=sys.stderr,
                    )
                    continue
                safe_id = "".join(c if c.isalnum() else "_" for c in nid)
                try:
                    img_data, _ = download_image(img_url)
                    out_path = export_dir / f"{safe_id}.png"
                    out_path.write_bytes(img_data)
                    size_k = len(img_data) / 1024
                    exported += 1
                    print(f"  {safe_id}.png ({size_k:.1f} KB)", flush=True)
                except Exception as e:
                    print(
                        f"  warning: failed to download node {nid}: {e}",
                        file=sys.stderr,
                    )

        print(
            f"Exported {exported}/{len(node_ids)} node(s) to {export_dir}.", flush=True
        )


if __name__ == "__main__":
    main()
