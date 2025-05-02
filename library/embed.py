import time
from PIL import Image
import requests
import torch
from transformers import CLIPProcessor, CLIPModel

# embed images with openai/clip-vit-large-patch14

# Load the model and processor
model = CLIPModel.from_pretrained("openai/clip-vit-large-patch14")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-large-patch14")


def embed(image_path):
    # if image_path is a URL
    if image_path.startswith("http://") or image_path.startswith("https://"):
        image = Image.open(requests.get(image_path, stream=True).raw)
    else:
        image = Image.open(image_path)

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
    embed("https://mozagqllybnbytfcmvdh.supabase.co/storage/v1/object/public/library/generated/22bc3204-c64e-4184-8405-e46ceaa126df.webp")
    print("Time taken:", time.time() - start_t)
    #
    # embed("path/to/local/image.jpg")
