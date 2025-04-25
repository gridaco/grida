import click
import json
import tempfile
import numpy as np
import cairosvg
from io import BytesIO
from PIL import Image
from pathlib import Path
from Pylette import extract_colors
from xml.etree import ElementTree as ET
from typing import Tuple, Dict
from PIL import Image


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def centroid_png(
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


def get_svg_metadata(file_path: Path):
    with open(file_path, "rb") as f:
        svg_bytes = f.read()
        size_bytes = len(svg_bytes)

    svg_root = ET.fromstring(svg_bytes)
    width = svg_root.attrib.get("width", "0")
    height = svg_root.attrib.get("height", "0")
    try:
        width = int(float(width))
        height = int(float(height))
    except ValueError:
        width = height = 0

    # ── rasterise once (we already do this for padding) ────────────────
    # Render SVG to raster (PNG)
    buffer = BytesIO()
    cairosvg.svg2png(url=str(file_path), write_to=buffer)
    buffer.seek(0)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_png:
        tmp_png.write(buffer.read())
        tmp_path = tmp_png.name

    # get the colors
    palette = extract_colors(image=tmp_path, palette_size=10)
    key_color = rgb_to_hex(palette[0].rgb)
    colors = [rgb_to_hex(c.rgb) for c in palette]

    fill = get_fill(file_path)
    if fill is None:
        fill = key_color

    centroid = get_visual_centroid(file_path)
    padding = get_visual_padding(file_path)
    transparency = get_transparency(file_path)

    orientation = get_orientation(width, height)

    return {
        "type": "svg",
        "name": file_path.stem,
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


# Helper to compute gravity center of SVG
def get_visual_centroid(svg_path: Path, raster_size: int = 512, snap_grid: int = 24):
    def snap(val): return round(val / snap_grid) * snap_grid
    # Render SVG to raster (PNG)
    buffer = BytesIO()
    cairosvg.svg2png(url=str(svg_path), write_to=buffer,
                     output_width=raster_size, output_height=raster_size)
    buffer.seek(0)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_png:
        tmp_png.write(buffer.read())
        tmp_path = tmp_png.name

    centroid = centroid_png(tmp_path)
    cx_pct, cy_pct = centroid["percent"]
    return (snap(cx_pct), snap(cy_pct))


def get_visual_padding(svg_path: Path, raster_size: int = 512):
    # Render SVG to raster
    buffer = BytesIO()
    cairosvg.svg2png(url=str(svg_path), write_to=buffer,
                     output_width=raster_size, output_height=raster_size)
    buffer.seek(0)

    img = Image.open(buffer).convert("LA")
    np_img = np.array(img)[:, :, 1]  # alpha channel
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


def get_transparency(svg_path: Path, raster_size: int = 512, threshold: int = 250) -> bool:
    """
    Render the SVG and inspect the alpha channel.
    Returns True if *any* pixel alpha < threshold (i.e. visible transparency).
    """
    buffer = BytesIO()
    cairosvg.svg2png(url=str(svg_path), write_to=buffer,
                     output_width=raster_size, output_height=raster_size)
    buffer.seek(0)

    img = Image.open(buffer).convert("LA")          # luminance + alpha
    alpha = np.array(img)[:, :, 1]                  # alpha channel
    return bool((alpha < threshold).any())


def get_orientation(w, h):
    if abs(w - h) < min(w, h) * 0.05:
        return "square"
    return "landscape" if w > h else "portrait"


def get_fill(svg_path: Path) -> str | None:
    """
    Inspect all elements in the SVG and categorise fill usage.

    Returns
    -------
    "currentColor"   -> exactly one element and its fill == currentColor
    "mixed"          -> more than one non‑uniform fill value detected
    None             -> no element has an explicit fill, or single uniform non‑currentColor fill
    """
    tree = ET.parse(svg_path)
    root = tree.getroot()

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

    # multiple elements
    return "mixed" if len(set(fills)) > 1 else ("currentColor" if list(set(fills))[0].lower() == "currentcolor" else None)


@click.command()
@click.argument("input_dir", type=click.Path(exists=True, file_okay=False))
def main(input_dir):
    input_path = Path(input_dir)
    for file in input_path.glob("*.svg"):
        meta = get_svg_metadata(file)
        out_path = file.with_name(file.stem + ".metadata.json")
        with open(out_path, "w") as f:
            json.dump(meta, f, indent=2)
        print(f"Wrote {out_path.name}")


if __name__ == "__main__":
    main()
