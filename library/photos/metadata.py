import click
import json
from pathlib import Path
from PIL import Image
from Pylette import extract_colors
import mimetypes


def get_orientation(w, h):
    if abs(w - h) < min(w, h) * 0.05:
        return "square"
    return "landscape" if w > h else "portrait"


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def analyze_image(file_path: Path):
    with Image.open(file_path) as img:
        width, height = img.size
        orientation = get_orientation(width, height)
        mimetype = mimetypes.guess_type(file_path)[0] or "image/jpeg"
        # Use pylette to get dominant and palette
        palette = extract_colors(image=file_path, palette_size=10)
        key_color = rgb_to_hex(palette[0].rgb)
        colors = [rgb_to_hex(c.rgb) for c in palette]
        background = colors[0] if colors else key_color
        bytes = file_path.stat().st_size

    return {
        "mimetype": mimetype,
        "color": key_color,
        "colors": colors,
        "background": background,
        "width": width,
        "height": height,
        "orientation": orientation,
        "bytes": bytes,
    }


@click.command()
@click.argument('input_dir', type=click.Path(exists=True, file_okay=False))
def cli(input_dir):
    input_path = Path(input_dir)
    for file in input_path.glob("*.[jJ][pP][gG]"):
        metadata = analyze_image(file)
        metadata_path = file.with_name(file.stem + ".metadata.json")
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)
        print(f"Created metadata for {file.name}")


if __name__ == "__main__":
    cli()
