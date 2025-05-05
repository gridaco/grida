"""
Image embedding generator using Amazon Titan Multimodal Embeddings G1 via AWS Bedrock.

This script reads an image (supports raster and SVG), encodes it in base64, and submits it
to the Titan embedding model via AWS Bedrock, returning a 1024D embedding.

Docs:
- Pricing: https://aws.amazon.com/ko/bedrock/pricing/
- Model reference: https://docs.aws.amazon.com/bedrock/latest/userguide/titan-multiemb-models.html

Image Constraints:
- Image formats: PNG, JPEG
- Input image size limit: 25 MB
- Image dimensions: min: 256 px, max: 4,096 px
- Max number of tokens in caption: 128
- Validation dataset size range: 8 - 50,000
- Caption length in characters: 0 - 2,560
- Maximum total pixels per image: 2048*2048*3
- Aspect ratio (w/h): min: 0.25, max: 4
"""

import base64
import requests
from io import BytesIO
from PIL import Image


def fit_image_for_titan_embed_image_v1(image_bytes: bytes) -> bytes:
    buffer = BytesIO(image_bytes)
    img_orig = Image.open(buffer)
    fmt = img_orig.format
    width, height = img_orig.size

    # early exit if image already meets Titan requirements
    if (
        fmt in ("PNG", "JPEG")
        and len(image_bytes) <= 25 * 1024 * 1024
        and 256 <= width <= 4096
        and 256 <= height <= 4096
        and 0.25 <= width / height <= 4
        and (width * height) <= 2048 * 2048
    ):
        return image_bytes

    buffer.seek(0)
    img = Image.open(buffer).convert("RGB")
    width, height = img.size
    aspect_ratio = width / height

    # Clamp aspect ratio
    if aspect_ratio < 0.25:
        new_width = int(height * 0.25)
        img = img.resize((new_width, height))
    elif aspect_ratio > 4:
        new_height = int(width / 4)
        img = img.resize((width, new_height))

    # Resize to fit within valid dimensions and max total pixels
    max_side = 4096
    min_side = 256
    max_pixels = 2048 * 2048 * 3

    width, height = img.size
    scale = min(max_side / max(width, height), 1)
    scale = min(scale, (max_pixels / (width * height * 3)) ** 0.5)
    new_width = max(int(width * scale), min_side)
    new_height = max(int(height * scale), min_side)
    img = img.resize((new_width, new_height))

    # Save as PNG in-memory
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    optimized_bytes = buffer.getvalue()

    # Ensure under 25MB
    if len(optimized_bytes) > 25 * 1024 * 1024:
        raise ValueError("Optimized image exceeds 25MB")

    return optimized_bytes


def b64(image: str | bytes, mimetype):
    if isinstance(image, (bytes, bytearray)):
        image_bytes = image
    elif image.startswith("http://") or image.startswith("https://"):
        image_bytes = requests.get(image, stream=True).content
    else:
        with open(image, "rb") as f:
            image_bytes = f.read()

    if mimetype == "image/svg+xml":
        import cairosvg
        image_bytes = cairosvg.svg2png(bytestring=image_bytes)

    image_bytes = fit_image_for_titan_embed_image_v1(image_bytes)
    return base64.b64encode(image_bytes).decode("utf-8")
