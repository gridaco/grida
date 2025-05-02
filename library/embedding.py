import time
from PIL import Image
import requests
import torch
from transformers import CLIPProcessor, CLIPModel
from io import BytesIO
import cairosvg

# embed images with openai/clip-vit-large-patch14

# Load the model and processor
model = CLIPModel.from_pretrained("openai/clip-vit-large-patch14")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-large-patch14")


def embed(image_path, mimetype):
    # Handle SVG by rendering to PNG when mimetype indicates SVG
    if mimetype == "image/svg+xml":
        if image_path.startswith("http://") or image_path.startswith("https://"):
            svg_data = requests.get(image_path, stream=True).content
        else:
            with open(image_path, "rb") as f:
                svg_data = f.read()
        png_bytes = cairosvg.svg2png(bytestring=svg_data)
        image = Image.open(BytesIO(png_bytes)).convert("RGB")
    else:
        # Raster image
        if image_path.startswith("http://") or image_path.startswith("https://"):
            image = Image.open(requests.get(
                image_path, stream=True).raw).convert("RGB")
        else:
            image = Image.open(image_path).convert("RGB")

    # Prepare the inputs
    inputs = processor(images=image, return_tensors="pt")

    # Generate the image embeddings
    with torch.no_grad():
        outputs = model.get_image_features(**inputs)

    # The 'outputs' tensor contains the image embeddings
    return outputs


if __name__ == "__main__":
    # Example usage
    start_t = time.time()
    embed("https://mozagqllybnbytfcmvdh.supabase.co/storage/v1/object/public/library/generated/22bc3204-c64e-4184-8405-e46ceaa126df.webp", "image/webp")
    print("Time taken:", time.time() - start_t)
