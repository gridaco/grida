from dotenv import load_dotenv
import os
import json
import mimetypes
import click
from pathlib import Path
from tqdm import tqdm
from supabase import create_client, Client

BUCKET_NAME = "library"


@click.command()
@click.argument('input_dir', type=click.Path(exists=True, file_okay=False))
@click.argument('category')
@click.option('--env-file', type=click.Path(exists=True, dir_okay=False), default=".env", show_default=True, help="Path to .env file")
def cli(input_dir, category, env_file):
    load_dotenv(env_file)
    url: str = os.environ.get("SUPABASE_URL")
    key: str = os.environ.get("SUPABASE_KEY")
    supabase: Client = create_client(url, key)
    input_path = Path(input_dir)
    for file in tqdm(list(input_path.glob("*.[jJ][pP][gG]")), desc="Uploading images"):
        object_path = file.with_name(file.stem + ".object.json")
        if not object_path.exists():
            tqdm.write(f"[SKIP] {file.name}: missing object.json")
            continue

        with open(object_path) as f:
            meta = json.load(f)

        content_type = mimetypes.guess_type(
            file)[0] or "application/octet-stream"

        path = f"{category}/{file.name}"

        with open(file, "rb") as fdata:
            res = supabase.storage.from_(BUCKET_NAME).upload(
                path, fdata, {"content-type": content_type, "x-upsert": "true"})

            # https://github.com/supabase/supabase-py/issues/1111
            search = supabase.storage.from_(BUCKET_NAME).list(
                category,
                {
                    "limit": 1,
                    "offset": 0,
                    "sortBy": {"column": "name", "order": "desc"},
                    "search": file.name,
                }
            )
            ref = search[0]

        uploaded_path = res.path
        uploaded_obj_id = ref.get("id")

        tqdm.write(f"[OK] uploaded {file.name} to {uploaded_path}")
        supabase.schema("grida_library").table("object").upsert({
            "id": uploaded_obj_id,
            "path": uploaded_path,
            "title": meta.get("title"),
            "description": meta["description"],
            "author_id": meta.get("author_id"),
            "category": category,
            "objects": meta.get("objects", []),
            "keywords": meta.get("keywords", []),
            "mimetype": meta["mimetype"],
            "width": meta["width"],
            "height": meta["height"],
            "bytes": meta["bytes"],
            "license": meta.get("license", "CC0-1.0"),
            "version": meta.get("version", 1),
            "color": meta["color"],
            "colors": meta.get("colors", []),
            "background": meta.get("background"),
            "score": meta.get("score"),
            "year": meta.get("year"),
            "entropy": meta.get("entropy"),
            "orientation": meta["orientation"],
            "gravity_x": meta.get("gravity_x"),
            "gravity_y": meta.get("gravity_y"),
            "lang": meta.get("lang"),
            "generator": meta.get("generator"),
            "prompt": meta.get("prompt"),
        }).execute()


if __name__ == "__main__":
    cli()
