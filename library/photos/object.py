

import json
import click
from pathlib import Path


@click.command()
@click.argument('input_dir', type=click.Path(exists=True, file_okay=False))
def cli(input_dir):
    input_path = Path(input_dir)

    for img_file in input_path.glob("*.[jJ][pP][gG]"):
        base = img_file.stem
        metadata_path = img_file.with_name(base + ".metadata.json")
        describe_path = img_file.with_name(base + ".describe.json")
        object_path = img_file.with_name(base + ".object.json")

        if not metadata_path.exists() or not describe_path.exists():
            print(f"[SKIP] {base}: missing metadata or describe file")
            continue

        with open(metadata_path) as f:
            metadata = json.load(f)

        with open(describe_path) as f:
            describe = json.load(f)

        combined = {**describe, **metadata}

        with open(object_path, "w") as f:
            json.dump(combined, f, indent=2)

        print(f"[OK] created {object_path.name}")


if __name__ == "__main__":
    cli()
