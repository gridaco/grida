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
@click.option('--folder', show_default=True, help="custom folder in bucket (uses category by default)")
@click.option('--type', 'file_type', type=click.Choice(['jpg', 'png', 'svg']), default='jpg', show_default=True, help="File type to process")
@click.option('--env-file', type=click.Path(exists=True, dir_okay=False), default=".env", show_default=True, help="Path to .env file")
def cli(input_dir, category, folder, file_type, env_file):
    load_dotenv(env_file)
    url: str = os.environ.get("SUPABASE_URL")
    key: str = os.environ.get("SUPABASE_KEY")
    supabase: Client = create_client(url, key)
    input_path = Path(input_dir)
    for file in tqdm(list(input_path.glob(f"*.{file_type}")), desc="Uploading objects"):
        object_path = file.with_name(file.stem + ".object.json")
        if not object_path.exists():
            tqdm.write(f"[SKIP] {file.name}: missing object.json")
            continue

        with open(object_path) as f:
            obj = json.load(f)

        mimetype = obj.get("mimetype")
        content_type = mimetypes.guess_type(
            file)[0] or "application/octet-stream"

        folder = folder or category
        path = f"{folder}/{file.name}"

        with open(file, "rb") as fdata:
            res = supabase.storage.from_(BUCKET_NAME).upload(
                path, fdata, {"content-type": mimetype or content_type, "x-upsert": "true"})

            # https://github.com/supabase/supabase-py/issues/1111
            search = supabase.storage.from_(BUCKET_NAME).list(
                folder,
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

        try:

            obj_author = obj.get("author")
            if obj_author:
                author = supabase.schema("grida_library").table("author").upsert(
                    obj_author, on_conflict="provider,username").execute()
                author_id = author.data[0].get("id")

            supabase.schema("grida_library").table("object").upsert({
                "id": uploaded_obj_id,
                "path": uploaded_path,
                "title": obj.get("title"),
                "description": obj["description"],
                "author_id": author_id if obj_author else None,
                "category": category,
                "objects": obj.get("objects", []),
                "keywords": obj.get("keywords", []),
                "mimetype": obj["mimetype"],
                "width": obj["width"],
                "height": obj["height"],
                "bytes": obj["bytes"],
                "license": obj.get("license"),
                "version": obj.get("version", 1),
                "fill": obj.get("fill"),
                "color": obj["color"],
                "colors": obj.get("colors", []),
                "background": obj.get("background"),
                "transparency": obj["transparency"],
                "score": obj.get("score"),
                "year": obj.get("year"),
                "entropy": obj.get("entropy"),
                "orientation": obj["orientation"],
                "gravity_x": obj.get("gravity_x"),
                "gravity_y": obj.get("gravity_y"),
                "lang": obj.get("lang"),
                "generator": obj.get("generator"),
                "prompt": obj.get("prompt"),
                "public_domain": obj.get("public_domain", False),
            }).execute()
        except Exception as e:
            tqdm.write(f"[ERROR] {file.name}: {e}")
            continue


if __name__ == "__main__":
    cli()
