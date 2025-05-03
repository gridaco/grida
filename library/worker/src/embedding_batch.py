import json
import click
from tqdm import tqdm
from supabase import create_client
from library.worker.src.transform import b64


@click.command()
@click.option("--supabase-url", envvar="SUPABASE_URL", required=True)
@click.option("--supabase-key", envvar="SUPABASE_KEY", required=True)
@click.option("--output", "-o", default="input.jsonl")
@click.option("--page-size", default=1000)
@click.option("--embedding-length", default=1024)
def main(supabase_url, supabase_key, output, page_size, embedding_length):
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


if __name__ == "__main__":
    main()
