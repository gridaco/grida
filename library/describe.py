import json
import click
from PIL import Image
import tempfile
from ollama import Client
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Optional
import logging
from tqdm import tqdm
import cairosvg

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

client = Client()


class DescriptionResult(BaseModel):
    objects: list[str] = Field(
        description="A list of objects that is find within the image.",
        examples=["cat", "dog", "car", "tree"]
    )
    description: str = Field(
        description="A short, human-readable and SEO-friendly description of the image.")
    alt: str = Field(
        description="A short alt text for the image.")
    category: str = Field(
        description="A single category that best represents the image.",
        examples=["nature", "people", "animals"]
    )
    categories: list[str] = Field(
        description="A list of categories that best represent the image.",
        examples=["nature", "people", "animals"]
    )
    keywords: list[str] = Field(
        description="A list of keywords that best represent the image.")
    color: str = Field(
        description="A single color that best represents the image.")
    colors: list[str] = Field(
        description="A list of colors that best represent the image.")
    background: str = Field(
        description="A color or description that best represents the background of the image.")
    entropy: float = Field(
        description="A measure of the visual complexity of the image, from 0 to 1. 0 being a solid color, 1 being a very complex image.")
    lang: Optional[str] = Field(
        description="If the text is detected, the language of the text, if any.")


def resize_image_for_analysis(filepath: Path, max_width: int = 1024) -> Path:
    if filepath.suffix.lower() == ".svg":
        # render svg to png
        rendered = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
        cairosvg.svg2png(url=str(filepath),
                         write_to=rendered.name, output_width=max_width)
        return Path(rendered.name)

    with Image.open(filepath) as img:
        if img.width <= max_width:
            return filepath
        ratio = max_width / img.width
        new_size = (max_width, int(img.height * ratio))
        img = img.convert("RGB").resize(new_size, Image.LANCZOS)

        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
        img.save(temp_file.name, format="PNG", quality=85)
        return Path(temp_file.name)


def describe_image(filepath: Path, model: str) -> DescriptionResult:
    resized_path = resize_image_for_analysis(filepath)
    try:
        response = client.generate(
            model=model,
            images=[resized_path],
            prompt="Visually Describe this image in detail.",
            format=DescriptionResult.model_json_schema()
        )
        return DescriptionResult.model_validate_json(response.response)
    finally:
        if resized_path != filepath:
            resized_path.unlink(missing_ok=True)


@click.command()
@click.argument('input_dir', type=click.Path(exists=True, file_okay=False))
@click.option('--model', default="gemma3:27b", show_default=True, help="Ollama model to use")
@click.option('--skip', is_flag=True, default=False, help="Skip files that already have .describe.json")
@click.option('--type', 'file_type', type=click.Choice(['jpg', 'png', 'svg']), default='jpg', show_default=True, help="File type to process")
def cli(input_dir, model, skip, file_type):

    available_models = [m.model for m in client.list()['models']]
    if model not in available_models:
        raise ValueError(
            f"Model '{model}' is not installed. Available: {available_models}")

    input_path = Path(input_dir)

    for file in tqdm(list(input_path.glob(f"*.{file_type}")), desc="Describing images"):
        describe_path = file.with_name(file.stem + ".describe.json")
        if skip and describe_path.exists():
            tqdm.write(f"[SKIP] {file.name} (already described)")
            continue
        try:
            result = describe_image(file, model)
            if result is None:
                tqdm.write(f"[WARN] failed to describe {file.name}")
                continue
            with open(describe_path, "w") as f:
                json.dump({**result.model_dump(), "model": model}, f, indent=2)
            tqdm.write(f"[OK] described {file.name}")
        except Exception as e:
            tqdm.write(f"[ERR] error processing {file.name}: {e}")


if __name__ == "__main__":
    cli()
