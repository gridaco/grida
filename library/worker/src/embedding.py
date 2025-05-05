"""
Image embedding generator using Amazon Titan Multimodal Embeddings G1 via AWS Bedrock.

This script reads an image (supports raster and SVG), encodes it in base64, and submits it
to the Titan embedding model via AWS Bedrock, returning a 1024D embedding.

Docs:
- Pricing: https://aws.amazon.com/ko/bedrock/pricing/
- Model reference: https://docs.aws.amazon.com/bedrock/latest/userguide/titan-multiemb-models.html

Cost:
- $0.00006 / image
- $0.0008 / 1K tokens
"""
import os
import json
import boto3
from dotenv import load_dotenv
from embedding_transform import b64

load_dotenv()

MODEL_ID = "amazon.titan-embed-image-v1"


class EmbedError(Exception):
    "Custom exception for errors returned by Amazon Titan Multimodal Embeddings G1"

    def __init__(self, message):
        self.message = message


def embed(image: str | bytes, mimetype) -> list:
    input_image = b64(image, mimetype)
    output_embedding_length = 1024

    body = json.dumps({
        "inputImage": input_image,
        "embeddingConfig": {
            "outputEmbeddingLength": output_embedding_length,
        }
    })

    bedrock = boto3.client(
        service_name="bedrock-runtime",
        region_name=os.getenv("AWS_REGION", "us-east-1"),
    )
    response = bedrock.invoke_model(
        body=body,
        modelId=MODEL_ID,
        accept="application/json",
        contentType="application/json"
    )

    response_body = json.loads(response.get("body").read())

    if response_body.get("message") is not None:
        raise EmbedError(
            f"Embeddings generation error: {response_body['message']}")

    return response_body["embedding"]


def embed_text(text: str) -> list:
    """
    Generate text embeddings using Amazon Titan Multimodal Embeddings G1 via AWS Bedrock.

    Args:
        text: The input text to generate embeddings for

    Returns:
        list: A 1024-dimensional embedding vector

    Raises:
        EmbedError: If the embedding generation fails
    """
    body = json.dumps({
        "inputText": text
    })

    bedrock = boto3.client(
        service_name="bedrock-runtime",
        region_name=os.getenv("AWS_REGION", "us-east-1"),
    )
    response = bedrock.invoke_model(
        body=body,
        modelId=MODEL_ID,
        accept="application/json",
        contentType="application/json"
    )

    response_body = json.loads(response.get("body").read())

    if response_body.get("message") is not None:
        raise EmbedError(
            f"Text embeddings generation error: {response_body['message']}")

    return response_body["embedding"]


def __test__():
    test_url = "https://mozagqllybnbytfcmvdh.supabase.co/storage/v1/object/public/library/generated/22bc3204-c64e-4184-8405-e46ceaa126df.webp"
    emb = embed(test_url, "image/webp")
    print("Embedding:", emb)


if __name__ == "__main__":
    __test__()
    pass
