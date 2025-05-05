import json
import requests
from pathlib import Path
import click
from tqdm import tqdm

UNSPLASH_COLLECTION_API = "https://api.unsplash.com/collections/{collection_id}/photos"


@click.command()
@click.argument("collection_id")
@click.option("--dir", type=click.Path(file_okay=False), help="Directory to save outputs")
@click.option("--access-key", envvar="UNSPLASH_ACCESS_KEY", required=True, help="Unsplash API access key")
@click.option("--download", is_flag=True, default=False, help="Download the image file")
@click.option("--q", type=click.Choice(["raw", "regular", "small"], case_sensitive=False), default="regular", help="Image quality to download")
def main(collection_id, access_key, dir, download, q):
    """
    Download images from Unsplash.

    @example
    python unsplash.py xR4Yt3AEXLY --download --q=regular --access-key="..." --dir=/path/to/out
    """
    output_path = Path(dir)
    output_path.mkdir(parents=True, exist_ok=True)

    page = 1
    while True:
        res = requests.get(
            UNSPLASH_COLLECTION_API.format(collection_id=collection_id),
            headers={"Authorization": f"Client-ID {access_key}"},
            params={"per_page": 30, "page": page}
        )
        res.raise_for_status()
        photos = res.json()

        if not photos:
            break

        for photo in tqdm(photos, desc=f"Processing page {page}"):
            username = photo["user"]["username"]
            photo_id = photo["id"]
            base_name = f"{username}-{photo_id}-unsplash"
            json_path = output_path / f"{base_name}.unsplash.json"
            img_path = output_path / f"{base_name}.jpg"

            # Write JSON
            with open(json_path, "w") as f:
                json.dump(photo, f, indent=2)

            # Optionally download image
            if download:
                img_url = photo["urls"][q]
                img_data = requests.get(img_url)
                img_data.raise_for_status()
                with open(img_path, "wb") as f:
                    f.write(img_data.content)

        page += 1


if __name__ == "__main__":
    main()
