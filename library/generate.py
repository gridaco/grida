import click
from diffusers import StableDiffusionXLPipeline, FluxPipeline
import torch
import platform
import hashlib


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


_pt_flux_1_dev = "black-forest-labs/FLUX.1-dev"
_pt_sdxl_base_1 = "stabilityai/stable-diffusion-xl-base-1.0"


@click.command()
@click.argument("prompt")
@click.option("--steps", default=None, type=int, help="Number of inference steps (e.g. 50, 100)")
@click.option("--model", required=True, type=click.Choice([_pt_flux_1_dev, _pt_sdxl_base_1]), help="Model to use")
@click.option("--n", default=1, type=int, help="Number of images to generate per prompt")
@click.option("--o", type=click.Path(), help="Output file")
def generate(prompt, model, steps, n, o):
    device = get_device()
    if model == _pt_sdxl_base_1:
        pipe = StableDiffusionXLPipeline.from_pretrained(
            model,
            torch_dtype=torch.bfloat16,
            use_safetensors=True,
        )
        pipe.to(device)
    elif model == _pt_flux_1_dev:
        pipe = FluxPipeline.from_pretrained(
            model,
            torch_dtype=torch.bfloat16,
            use_safetensors=True,
        )
        pipe.to(device)

    pipe_args = {"prompt": prompt}
    if steps is not None:
        pipe_args["num_inference_steps"] = steps
    if n := 1:
        pipe_args["num_images_per_prompt"] = n

    image = pipe(**pipe_args).images[0]
    model_label = model.split("/")[-1]
    filename = o if o else f"{model_label}-{safe_filename(prompt)}-{steps if steps else 'default'}.png"
    image.save(filename)
    print(f"Saved: {filename}")


if __name__ == "__main__":
    generate()
