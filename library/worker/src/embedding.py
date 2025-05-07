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


def embed(image: str | bytes, mimetype, text: str | None = None) -> list:
    """
    Generate embeddings using Amazon Titan Multimodal Embeddings G1 via AWS Bedrock.
    Can handle both image-only and image+text inputs.

    Args:
        image: The input image (as bytes or string)
        mimetype: The MIME type of the image
        text: Optional text to be used alongside the image for embedding generation

    Returns:
        list: A 1024-dimensional embedding vector

    Raises:
        EmbedError: If the embedding generation fails
    """
    input_image = b64(image, mimetype)
    output_embedding_length = 1024

    body = {
        "inputImage": input_image,
        "embeddingConfig": {
            "outputEmbeddingLength": output_embedding_length,
        }
    }

    if text is not None:
        body["inputText"] = text

    bedrock = boto3.client(
        service_name="bedrock-runtime",
        region_name=os.getenv("AWS_REGION", "us-east-1"),
    )
    response = bedrock.invoke_model(
        body=json.dumps(body),
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
