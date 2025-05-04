import click
import jsonlines
import torch
import platform
import hashlib
from diffusers import StableDiffusionXLPipeline, FluxPipeline
from pathlib import Path


def safe_filename(prompt: str) -> str:
    hash_part = hashlib.md5(prompt.encode()).hexdigest()[:8]
    clean = "_".join(prompt.lower().split())[:100]  # truncate
    return f"{clean}_{hash_part}"


def get_device():
    if torch.backends.mps.is_available() and platform.system() == "Darwin":
        return "mps"
    elif torch.cuda.is_available():
        return "cuda"
    else:
        return "cpu"


# supported models
_pt_flux_1_schnell = "black-forest-labs/FLUX.1-schnell"
_pt_flux_1_dev = "black-forest-labs/FLUX.1-dev"
_pt_sdxl_base_1 = "stabilityai/stable-diffusion-xl-base-1.0"


@click.command()
@click.argument("prompt_or_file")
@click.option("--steps", default=None, type=int, help="Number of inference steps (e.g. 50, 100)")
@click.option("--model", required=True, type=click.Choice([_pt_flux_1_dev, _pt_flux_1_schnell, _pt_sdxl_base_1]), help="Model to use")
@click.option("--size", default="1024x1024", type=str, help="Image size (e.g. 512x512, 768x768, 1024x1024)")
@click.option("--n", default=1, type=int, help="Number of images to generate per prompt")
@click.option("--o", type=click.Path(), help="Output path")
def generate(prompt_or_file, size: str, model: str, steps, n, o):
    """
    Generate images from prompts using the specified model.

    This function accepts either a single prompt string or a path to a file containing prompts.
    If the input is a file, it supports reading prompts from a plain text file (one prompt per line) or a JSONL file with a 'prompt' field.
    Images are generated using the selected model and saved to the specified output path or current directory.

    Args:
        prompt_or_file (str): A prompt string or path to a file containing prompts.
        model (str): The model identifier to use for generation.
        steps (int, optional): Number of inference steps. Defaults to None.
        n (int): Number of images to generate per prompt.
        o (str, optional): Output path to save images.
    """

    # Parse size
    width, height = map(int, size.split("x"))

    device = get_device()
    # stable-diffusion
    if model == _pt_sdxl_base_1:
        pipe = StableDiffusionXLPipeline.from_pretrained(
            model,
            torch_dtype=torch.bfloat16,
            use_safetensors=True,
        )
        pipe.to(device)
    # flux.1
    elif model.startswith("black-forest-labs/FLUX.1"):
        pipe = FluxPipeline.from_pretrained(
            model,
            torch_dtype=torch.bfloat16,
            use_safetensors=True,
        )
        pipe.to(device)

    path = Path(prompt_or_file)
    prompts = []
    if path.is_file():
        if path.suffix == ".jsonl":
            with jsonlines.open(str(path), "r") as reader:
                for obj in reader:
                    prompt = obj.get("prompt", "").strip()
                    if prompt:
                        prompts.append(prompt)
        else:
            with path.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        prompts.append(line)
    else:
        prompts = [prompt_or_file]

    for idx, prompt in enumerate(prompts):
        pipe_args = {
            "prompt": prompt,
            "width": width,
            "height": height,
        }
        if steps is not None:
            pipe_args["num_inference_steps"] = steps
        if n:
            pipe_args["num_images_per_prompt"] = n

        images = pipe(**pipe_args).images
        model_label = model.split("/")[-1]

        __base_model_file_name = f"{model_label}-{steps if steps else 'default'}-{size}"
        for i, image in enumerate(images):
            if o:
                output_path = Path(o)
                output_path.mkdir(parents=True, exist_ok=True)
                filename = output_path / \
                    f"{__base_model_file_name}-{safe_filename(prompt)}-{i:03}.png"
            else:
                filename = f"{__base_model_file_name}-{safe_filename(prompt)}-{i:03}.png"
            image.save(filename)
            print(f"Saved: {filename}")


if __name__ == "__main__":
    generate()
