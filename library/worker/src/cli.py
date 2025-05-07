import click
import json
import time
import mimetypes
from pathlib import Path
from tqdm import tqdm
from supabase import create_client
from embedding_transform import b64
from embedding import embed, embed_text


@click.group()
def cli():
    """Command line interface for the library worker."""
    pass


@cli.group()
def prepare():
    pass


@prepare.command("dump")
@click.option("--supabase-url", envvar="SUPABASE_URL", required=True)
@click.option("--supabase-key", envvar="SUPABASE_KEY", required=True)
@click.option("--output", "-o", default="dump.jsonl")
@click.option("--page-size", default=1000)
@click.option("--embedding-length", default=1024)
def cli_dump(supabase_url, supabase_key, output, page_size, embedding_length):
    """
    Create a JSONL file with the input for the embedding model.
    """
    sb = create_client(supabase_url, supabase_key)
    library = sb.schema("grida_library")

    # Get total count
    count_resp = (
        library
        .table("object")
        .select("id", count="exact")
        .limit(1)
        .execute()
    )
    total_count = count_resp.count or 0

    page = 0
    with open(output, "w") as f, tqdm(total=total_count, desc="Processing") as pbar:
        while True:
            start = page * page_size
            end = start + page_size - 1
            resp = (
                library
                .table("object")
                .select("id,path,mimetype")
                .range(start, end)
                .execute()
            )
            items = resp.data or []
            if not items:
                break

            for obj in items:
                try:
                    path = obj["path"]
                    mimetype = obj.get("mimetype")
                    dl = sb.storage.from_("library").download(path)
                    img_b64 = b64(dl, mimetype)
                    record = {
                        "recordId": obj["id"],
                        "modelInput": {
                            "inputImage": img_b64,
                            "embeddingConfig": {"outputEmbeddingLength": embedding_length}
                        }
                    }
                    f.write(json.dumps(record) + "\n")
                except Exception as e:
                    print(f"[error] {obj.get('id') or obj.get('path')}: {e}")
                pbar.update(1)

            page += 1


MAX_BYTES_PER_FILE = 1_073_741_824  # 1 GB


@prepare.command("chunk")
@click.argument("input_file", type=click.Path(exists=True, path_type=Path))
@click.argument("output_dir", type=click.Path(path_type=Path))
def chunk_jsonl(input_file: Path, output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)

    i = 0
    size = 0
    out_path = output_dir / f"{i:03}.jsonl"
    out = out_path.open("w", encoding="utf-8")

    with input_file.open("r", encoding="utf-8") as f, tqdm(
        total=input_file.stat().st_size, desc="Chunking", unit="B", unit_scale=True
    ) as pbar:
        for line in f:
            line_size = len(line.encode("utf-8"))
            if size + line_size > MAX_BYTES_PER_FILE:
                out.close()
                i += 1
                size = 0
                out_path = output_dir / f"{i:03}.jsonl"
                out = out_path.open("w", encoding="utf-8")
            out.write(line)
            size += line_size
            pbar.update(line_size)

    out.close()
    click.echo(f"✅ Done: {i+1} chunk(s) saved to '{output_dir}'")


@prepare.command("merge")
@click.argument("input_path", type=click.Path(exists=True, path_type=Path))
@click.argument("output_file", type=click.Path(path_type=Path), default="out.jsonl")
def merge_jsonl(input_path, output_file):
    """
    Merge JSONL output files into a single file, omitting the `modelOutput` key.
    If a directory is given, it will merge all `*.jsonl.out` files within.

    the jsonl files contain {"recordId": "...", "modelInput": {...}, "modelOutput": {...}, "error": {...}}
    the merged fils ommits the `modelInput`, error is optional, only present if there was an error
    """
    if input_path.is_dir():
        input_files = sorted(input_path.glob("*.jsonl.out"))
    else:
        input_files = [input_path]

    with output_file.open("w", encoding="utf-8") as f_out:
        for input_file in input_files:
            with input_file.open("r", encoding="utf-8") as f_in:
                for line in tqdm(f_in, desc=f"Merging {input_file.name}", unit="lines"):
                    try:
                        obj = json.loads(line)
                        obj.pop("modelInput", None)
                        f_out.write(json.dumps(obj) + "\n")
                    except json.JSONDecodeError as e:
                        print(
                            f"[error] {input_file.name}: failed to parse line: {e}")


@cli.group()
def sync():
    pass


@sync.command("embeddings")
@click.argument("embeddings_file", type=click.Path(exists=True, path_type=Path))
@click.option("--supabase-url", envvar="SUPABASE_URL", required=True)
@click.option("--supabase-key", envvar="SUPABASE_KEY", required=True)
def sync_embeddings(embeddings_file, supabase_url, supabase_key):
    """Sync a merged JSONL file of embeddings to Supabase."""

    supabase = create_client(supabase_url, supabase_key)
    library_client = supabase.schema("grida_library")

    total_lines = sum(1 for _ in embeddings_file.open("r", encoding="utf-8"))
    with embeddings_file.open("r", encoding="utf-8") as f:
        for line in tqdm(f, desc="Syncing embeddings", unit="object", total=total_lines):
            try:
                obj = json.loads(line)
                object_id = obj["recordId"]
                if obj.get("error"):
                    tqdm.write(
                        f"[ignore/error] {object_id} has error - ignoring")
                    continue

                vector = obj["modelOutput"]["embedding"]
                library_client.table("object_embedding").upsert({
                    "object_id": object_id,
                    "embedding": vector
                }).execute()
                tqdm.write(f"[ok] synced {object_id}")
            except Exception as e:
                print(
                    f"[error] failed to sync {obj.get('recordId', '<unknown>')}: {e}")


@cli.group()
def test():
    pass


@test.command("text")
@click.argument("text", type=str)
def test_text(text):
    start = time.time()
    embedding = embed_text(text)
    end = time.time()
    click.echo(embedding)
    click.echo(f"Time taken: {end - start} seconds")
    return embedding


@test.command("image")
@click.argument("image_path", type=click.Path(exists=True))
@click.option("--text", "-t", type=str, help="Optional text to use alongside the image")
def test_image(image_path, text):
    """Test image embedding with optional text."""
    path = Path(image_path)
    mimetype, _ = mimetypes.guess_type(path)
    if mimetype is None:
        click.echo(
            f"Error: Could not determine MIME type for {path}", err=True)
        return

    with open(path, "rb") as f:
        image_data = f.read()

    start = time.time()
    embedding = embed(image_data, mimetype, text)
    end = time.time()

    click.echo(embedding)
    click.echo(f"Time taken: {end - start} seconds")
    return embedding


if __name__ == "__main__":
    cli()
