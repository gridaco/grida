# merges
# - .(jpg|png|svg)
# - .meta.json
# - .describe.json
# - .unsplash.json
# into a single .object.json file for library upload.

import json
import click
from pathlib import Path
from glom import glom, assign


map_meta = {
    "name": "name",
    "license": "license",
    "mimetype": "mimetype",
    "fill": "fill",
    "color": "color",
    "colors": "colors",
    "width": "width",
    "height": "height",
    "bytes": "bytes",
    "centroid": "centroid",
    "padding": "padding",
    "orientation": "orientation",
    "transparency": "transparency",
    "public_domain": "public_domain"
}

map_describe = {
    "objects": "objects",
    "description": "description",
    "category": "category",
    "categories": "categories",
    "keywords": "keywords",
}

map_unsplash = {
    "description": "description",
    "user.name": "author.name",
    "user.username": "author.username",
    "user.portfolio_url": "author.blog",
    "user.profile_image.medium": "author.avatar_url",
}


@click.command()
@click.argument('input_dir', type=click.Path(exists=True, file_okay=False))
@click.option('--partial-ok', is_flag=True, default=False, help="Ignore missing metadata or describe files")
@click.option('--type', 'file_type', type=click.Choice(['jpg', 'png', 'svg']), default='jpg', show_default=True, help="File type to process")
@click.option('--license', show_default=True, help="Fallback License to apply")
def cli(input_dir, partial_ok, file_type, license):
    input_path = Path(input_dir)

    def extract_from_metadata(path):
        if not path.exists():
            return {}
        with open(path) as f:
            raw = json.load(f)
        result = {}
        for src, dest in map_meta.items():
            value = glom(raw, src, default=None)
            if value is not None:
                assign(result, dest, value, missing=dict)
        return result

    def extract_from_describe(path):
        if not path.exists():
            return {}
        with open(path) as f:
            raw = json.load(f)
        result = {}
        for src, dest in map_describe.items():
            value = glom(raw, src, default=None)
            if value is not None:
                assign(result, dest, value, missing=dict)
        return result

    def extract_from_unsplash(path):
        if not path.exists():
            return None
        with open(path) as f:
            raw = json.load(f)
        result = {
            "license": "Unsplash License",
            "author": {"provider": "unsplash"}
        }
        for src, dest in map_unsplash.items():
            value = glom(raw, src, default=None)
            if value is not None:
                assign(result, dest, value, missing=dict)
        return result

    for rawfile in input_path.glob(f"*.{file_type}"):
        base = rawfile.stem
        metadata_path = rawfile.with_name(base + ".metadata.json")
        metadata_path_ok = metadata_path.exists()
        describe_path = rawfile.with_name(base + ".describe.json")
        describe_path_ok = describe_path.exists()
        unsplash_path = rawfile.with_name(base + ".unsplash.json")
        unsplash_path_ok = unsplash_path.exists()
        object_path = rawfile.with_name(base + ".object.json")

        if not metadata_path_ok:
            print(f"[SKIP] {base}: missing metadata file")
            continue

        if not partial_ok and (not describe_path_ok):
            print(f"[SKIP] {base}: missing metadata or describe file")
            continue

        data = {}
        data.update(extract_from_metadata(metadata_path))
        if unsplash_path_ok:
            data.update(extract_from_unsplash(unsplash_path))
        if describe_path_ok:
            data.update(extract_from_describe(describe_path))

        # fallbacks
        if not data.get("description") and data.get("name"):
            data["description"] = data.get("name")

        if not data.get("license"):
            data["license"] = license

        with open(object_path, "w") as f:
            json.dump(data, f, indent=2)

        print(f"[OK] created {object_path.name}")


if __name__ == "__main__":
    cli()
