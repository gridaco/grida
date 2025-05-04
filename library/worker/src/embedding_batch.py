import json
import click
from pathlib import Path
from tqdm import tqdm
from supabase import create_client
from transform import b64


@click.group()
def cli():
    """Command line interface for the library worker."""
    pass


@cli.command("dump")
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


@cli.command("chunk")
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


if __name__ == "__main__":
    cli()
