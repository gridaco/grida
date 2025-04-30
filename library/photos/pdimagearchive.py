import click
import json
import os
import requests
from tqdm import tqdm

SRC_BASE_URL = "https://the-public-domain-review.imgix.net"


@click.group()
def cli():
    """PD Image Archive CLI"""
    pass


@cli.command("archive")
@click.argument('images', type=click.Path(exists=True))
@click.argument('download_dir', type=click.Path(exists=False))
@click.option('--no-skip', is_flag=True, default=False, help="Download all images even if they already exist.")
def archive(images, download_dir, no_skip):
    """
    CLI to process the PDImageArchive JSONL file.
    """

    # Archive images
    with open(images, 'r', encoding='utf-8') as f:
        images = json.load(f)

        os.makedirs(download_dir, exist_ok=True)
        for img in tqdm(images, desc="Downloading images"):
            src = img.get("src")
            if not src:
                continue
            url = SRC_BASE_URL + src
            uuid = img.get("uuid")
            ext = os.path.splitext(src.split("?")[0])[1].lower()
            if ext == '.jpeg':
                ext = '.jpg'  # use .jpg extension for consistency (if .jpeg)
            filename = f"{uuid}{ext}" if uuid and ext else os.path.basename(
                src)
            path = os.path.join(download_dir, filename)

            if not no_skip and os.path.exists(path):
                continue

            try:
                response = requests.get(url, timeout=10)
                if response.status_code == 200:
                    with open(path, "wb") as f:
                        f.write(response.content)
                else:
                    print(f"Failed to download {url}: {response.status_code}")
            except Exception as e:
                print(f"Error downloading {url}: {e}")

        print(f"Archived images to {download_dir}")


@cli.command("dump")
@click.argument('file_path', type=click.Path(exists=True))
@click.argument('output_path', type=click.Path())
def dump(file_path, output_path):
    """
    Dump unique images from a JSONL file to a JSON file.
    the jsonl file contains 1.json, 2.json, ... api responses from the https://pdimagearchive.org.
    """
    # dump_unique_images("pdimagearchive.jsonl", "pdimagearchive.json")
    seen = set()
    all_images = []

    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                data = json.loads(line)
                images = data.get("images", [])
                for img in images:
                    uuid = img.get("uuid")
                    if uuid and uuid not in seen:
                        seen.add(uuid)
                        all_images.append(img)
            except Exception:
                continue

    with open(output_path, 'w', encoding='utf-8') as out:
        json.dump(all_images, out, ensure_ascii=False)

    print(f"Dumped {len(all_images)} unique images to {output_path}")


if __name__ == "__main__":
    cli()
