import click
import json
import mimetypes
import tempfile
import numpy as np
import cairosvg
from pathlib import Path
from PIL import Image
from Pylette import extract_colors
from io import BytesIO
from xml.etree import ElementTree as ET
from typing import Tuple, Dict


def get_orientation(w, h):
    if abs(w - h) < min(w, h) * 0.05:
        return "square"
    return "landscape" if w > h else "portrait"


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def png_centroid(
    png_path: Path | str,
    threshold: int = 16,      # ≥ threshold is treated as ‘ink’
    use_alpha: bool = True    # treat alpha channel as mask if present
) -> Dict[str, Tuple[float, float]]:
    """
    Return the centroid of visible pixels in a PNG.

    Returns
    -------
    {
        "pixel": (cx_px, cy_px),      # float pixel coordinates
        "percent": (cx_pct, cy_pct)  # 0-100 %
    }
    If the image is fully transparent / blank, falls back to canvas centre.
    """
    img = Image.open(png_path)

    # --- build binary mask ---------------------------------------------
    if use_alpha and "A" in img.getbands():
        mask = np.array(img.split()[-1])          # alpha channel
    else:
        mask = np.array(img.convert("L"))         # luminance

    binary = mask > threshold                     # foreground mask

    ys, xs = np.where(binary)
    if xs.size == 0:                              # empty image fallback
        cx_px = img.width / 2
        cy_px = img.height / 2
    else:
        cx_px = xs.mean()
        cy_px = ys.mean()

    # --- convert to % of canvas ---------------------------------------
    cx_pct = cx_px / img.width * 100
    cy_pct = cy_px / img.height * 100

    return {
        "pixel":   (cx_px, cy_px),
        "percent": (cx_pct, cy_pct)
    }


def image_metadata(file_bytes: bytes):
    """
    Get metadata for an image from raw bytes.
    """
    stream = BytesIO(file_bytes)
    with Image.open(stream) as img:
        width, height = img.size
        orientation = get_orientation(width, height)

        # Try to guess mimetype from header, fallback to jpeg
        mimetype = None
        try:
            import imghdr
            fmt = imghdr.what(None, h=file_bytes)
            if fmt:
                mimetype = mimetypes.types_map.get(f".{fmt}", None)
        except Exception:
            mimetype = None

        if mimetype is None:
            mimetype = "image/jpeg"

        stream.seek(0)
        palette = extract_colors(image=stream, palette_size=10)
        key_color = rgb_to_hex(palette[0].rgb)
        colors = [rgb_to_hex(c.rgb) for c in palette]
        bytes_len = len(file_bytes)
        transparency = img.info.get("transparency") is not None

    return {
        "mimetype": mimetype,
        "color": key_color,
        "colors": colors,
        "width": width,
        "height": height,
        "orientation": orientation,
        "bytes": bytes_len,
        "transparency": transparency,
    }


def svg_metadata(file_bytes: bytes):
    size_bytes = len(file_bytes)
    svg_root = ET.fromstring(file_bytes)
    width = svg_root.attrib.get("width", "0")
    height = svg_root.attrib.get("height", "0")
    try:
        width = int(float(width))
        height = int(float(height))
    except ValueError:
        width = height = 0

    buffer = BytesIO()
    cairosvg.svg2png(bytestring=file_bytes, write_to=buffer)
    buffer.seek(0)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_png:
        tmp_png.write(buffer.read())
        tmp_path = tmp_png.name

    palette = extract_colors(image=tmp_path, palette_size=10)
    key_color = rgb_to_hex(palette[0].rgb)
    colors = [rgb_to_hex(c.rgb) for c in palette]

    fill = _svg_fill(file_bytes)
    if fill is None:
        fill = key_color

    centroid = _svg_visual_centroid(file_bytes)
    padding = _svg_visual_padding(file_bytes)
    transparency = _svg_transparency(file_bytes)

    orientation = get_orientation(width, height)

    return {
        "type": "svg",
        "width": width,
        "height": height,
        "orientation": orientation,
        "bytes": size_bytes,
        "mimetype": "image/svg+xml",
        "color": key_color,
        "colors": colors,
        "fill": fill,
        "centroid": centroid,
        "padding": padding,
        "transparency": transparency
    }


def _svg_visual_centroid(svg_bytes: bytes, raster_size: int = 512, snap_grid: int = 24):
    def snap(val): return round(val / snap_grid) * snap_grid
    buffer = BytesIO()
    cairosvg.svg2png(bytestring=svg_bytes, write_to=buffer,
                     output_width=raster_size, output_height=raster_size)
    buffer.seek(0)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_png:
        tmp_png.write(buffer.read())
        tmp_path = tmp_png.name

    centroid = png_centroid(tmp_path)
    cx_pct, cy_pct = centroid["percent"]
    return (snap(cx_pct), snap(cy_pct))


def _svg_visual_padding(svg_bytes: bytes, raster_size: int = 512):
    buffer = BytesIO()
    cairosvg.svg2png(bytestring=svg_bytes, write_to=buffer,
                     output_width=raster_size, output_height=raster_size)
    buffer.seek(0)

    img = Image.open(buffer).convert("LA")
    np_img = np.array(img)[:, :, 1]
    binary = np_img > 16

    ys, xs = np.where(binary)
    if len(xs) == 0 or len(ys) == 0:
        return [0, 0, 0, 0]

    top = np.min(ys)
    bottom = raster_size - np.max(ys) - 1
    left = np.min(xs)
    right = raster_size - np.max(xs) - 1

    return [
        round(top / raster_size * 100),
        round(right / raster_size * 100),
        round(bottom / raster_size * 100),
        round(left / raster_size * 100),
    ]


def _svg_transparency(svg_bytes: bytes, raster_size: int = 512, threshold: int = 250) -> bool:
    """
    Render the SVG and inspect the alpha channel.
    Returns True if *any* pixel alpha < threshold (i.e. visible transparency).
    """
    buffer = BytesIO()
    cairosvg.svg2png(bytestring=svg_bytes, write_to=buffer,
                     output_width=raster_size, output_height=raster_size)
    buffer.seek(0)

    img = Image.open(buffer).convert("LA")
    alpha = np.array(img)[:, :, 1]
    return bool((alpha < threshold).any())


def _svg_fill(svg_bytes: bytes) -> str | None:
    """
    Inspect all elements in the SVG and categorise fill usage.

    Returns
    -------
    "currentColor"   -> exactly one element and its fill == currentColor
    "mixed"          -> more than one non‑uniform fill value detected
    None             -> no element has an explicit fill, or single uniform non‑currentColor fill
    """
    root = ET.fromstring(svg_bytes)
    fills = []
    for elem in root.iter():
        fill = elem.attrib.get("fill")
        if fill is None or fill.lower() == "none":
            continue
        fills.append(fill.strip())

    if not fills:
        return None

    if len(fills) == 1:
        return "currentColor" if fills[0].lower() == "currentcolor" else None

    return "mixed" if len(set(fills)) > 1 else ("currentColor" if list(set(fills))[0].lower() == "currentcolor" else None)


def object_metadata(file: Path | bytes, mimetype: str = None) -> Dict:
    """
    Get metadata for an object file.
    """
    mimetype = mimetype or mimetypes.guess_type(file)[0]
    if mimetype is None:
        raise ValueError(f"Unknown mimetype for {file}")

    file_bytes = file if isinstance(file, bytes) else file.read_bytes()
    if mimetype.startswith("image/svg+xml"):
        return svg_metadata(file_bytes)
    elif mimetype.startswith("image/"):
        return image_metadata(file_bytes)
    else:
        raise ValueError(f"Unsupported file type: {mimetype}")


@click.group()
def cli():
    pass


@cli.command()
@click.argument('input_dir', type=click.Path(exists=True, file_okay=False))
@click.option('--type', 'file_type', type=click.Choice(['jpg', 'png', 'svg']), default='jpg', show_default=True, help="File type to process")
def cli_any(input_dir, file_type):
    input_path = Path(input_dir)
    for file in input_path.glob(f"*.{file_type}"):
        metadata = object_metadata(file)
        metadata_path = file.with_name(file.stem + ".metadata.json")
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)
        print(f"Created metadata for {file.name}")


if __name__ == "__main__":
    cli()
