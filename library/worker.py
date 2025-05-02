from dotenv import load_dotenv
import click
import os
from tqdm import tqdm
from supabase import create_client, Client
from embedding import embed


BUCKET_NAME = "library"


# CLI command to fetch objects, skip those already indexed, and embed the rest
@click.command()
@click.option(
    '--env-file',
    type=click.Path(exists=True, dir_okay=False),
    default=".env",
    show_default=True,
    help="Path to .env file"
)
def cli(env_file):
    load_dotenv(env_file)
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    supabase: Client = create_client(url, key)

    last_id = None
    pbar = tqdm(desc="Embedding images", unit="image")
    while True:
        query = supabase.schema("grida_library").table("object") \
            .select("id,path,mimetype") \
            .order("priority", desc=False) \
            .order("id", desc=False) \
            .like("mimetype", "image/%") \
            .limit(1)
        if last_id:
            query = query.gt("id", last_id)
        result = query.execute()
        items = result.data or []
        if not items:
            break
        obj = items[0]
        last_id = obj["id"]

        object_id = obj.get("id")
        # Skip if already indexed
        emb_check = supabase.schema("grida_library") \
            .table("object_embedding_clip_l14") \
            .select("object_id") \
            .eq("object_id", object_id) \
            .maybe_single() \
            .execute()
        if emb_check:
            pbar.update(1)
            continue

        # Embed and insert embedding with error isolation
        try:
            path = obj.get("path")
            public_url = f"{url}/storage/v1/object/public/{BUCKET_NAME}/{path}"
            vector = embed(public_url, obj["mimetype"])
            try:
                embedding = vector.squeeze().cpu().tolist()
            except AttributeError:
                embedding = vector.tolist()
            supabase.schema("grida_library") \
                .table("object_embedding_clip_l14") \
                .insert({
                    "object_id": object_id,
                    "embedding": embedding
                }) \
                .execute()
        except Exception as e:
            tqdm.write(f"[ERROR] {object_id}: {e}")
        finally:
            pbar.update(1)
    pbar.close()

    tqdm.write("All unfinished images have been embedded.")


if __name__ == "__main__":
    cli()
