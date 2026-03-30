#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["ollama"]
# ///
"""
ask.py — Query an image with a local Ollama vision model.

Run with uv (auto-installs dependencies):
  uv run ask.py <image>                         # describe the image
  uv run ask.py <image> describe                # explicit describe
  uv run ask.py <image> --prompt "..."          # custom question
  uv run ask.py <image> --model <name>          # specify model
  uv run ask.py --list-models                   # show available vision models
  uv run ask.py --ping                          # quick health check
  uv run ask.py --memory                        # show system memory info
  uv run ask.py --storage                       # show available disk storage
  uv run ask.py --info                          # show memory + storage + models
"""

import argparse
import shutil
import sys
from pathlib import Path

try:
    import ollama
except ImportError:
    print(
        "error: 'ollama' package not found.\n"
        "       run this script with: uv run ask.py ...\n"
        "       or install manually:  pip install ollama",
        file=sys.stderr,
    )
    sys.exit(1)

# Ordered by preference. First available wins when --model is not specified.
# Update this list every ~6 months as better low-cost vision models emerge.
# Last updated: 2026-03 — qwen3.5 added as top pick.
PREFERRED_VISION_MODELS = [
    "qwen3.5",
    "qwen2.5vl",
    "gemma3",
    "llama3.2-vision",
    "llava",
]

# Name fragments that reliably indicate vision capability.
VISION_NAME_FRAGMENTS = [
    "qwen",
    "gemma3",
    "vl",
    "vision",
    "llava",
    "moondream",
    "bakllava",
    "cogvlm",
    "minicpm-v",
    "phi3.5-vision",
]

DESCRIBE_PROMPT = (
    "Describe this image concisely. "
    "Note layout, content, colors, and any visible text or UI elements."
)


# ---------------------------------------------------------------------------
# Ollama helpers
# ---------------------------------------------------------------------------


def _check_server() -> None:
    """Fail fast if Ollama is not reachable."""
    try:
        ollama.list()
    except Exception as e:
        print(
            f"error: cannot reach Ollama — {e}\n"
            "hint:  make sure Ollama is running (`ollama serve`)",
            file=sys.stderr,
        )
        sys.exit(1)


def _list_models() -> list[str]:
    """Return names of all installed models."""
    resp = ollama.list()
    return [m.model for m in resp.models]


def is_vision_model(name: str) -> bool:
    low = name.lower()
    return any(frag in low for frag in VISION_NAME_FRAGMENTS)


def list_vision_models() -> list[str]:
    return [m for m in _list_models() if is_vision_model(m)]


def pick_model(requested: str | None) -> str:
    available = list_vision_models()

    if not available:
        installed = _list_models()
        if installed:
            print(
                f"error: no vision-capable models found.\n"
                f"       installed models: {', '.join(installed)}\n"
                f"       install one with: ollama pull qwen3.5",
                file=sys.stderr,
            )
        else:
            print(
                "error: no models installed.\n"
                "       install one with: ollama pull qwen3.5",
                file=sys.stderr,
            )
        sys.exit(1)

    if requested:
        matches = [m for m in available if m == requested or m.startswith(requested + ":")]
        if not matches:
            print(
                f"error: model '{requested}' is not available or not a vision model.\n"
                f"       available vision models: {', '.join(available)}",
                file=sys.stderr,
            )
            sys.exit(1)
        return matches[0]

    # Pick first preferred model that is installed.
    for preferred in PREFERRED_VISION_MODELS:
        for installed in available:
            if installed == preferred or installed.startswith(preferred + ":"):
                return installed

    return available[0]


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def cmd_ping(model: str) -> None:
    """Send a trivial text prompt — no image — to verify model responds."""
    print(f"pinging {model} …")
    resp = ollama.generate(model=model, prompt="Reply with exactly: pong")
    print(resp.response.strip())


def cmd_ask(image_path: Path, prompt: str, model: str) -> None:
    """Send an image + prompt to the model."""
    resp = ollama.generate(
        model=model,
        prompt=prompt,
        images=[str(image_path)],
    )
    print(resp.response.strip())


def cmd_list_models() -> None:
    _check_server()
    all_models = _list_models()
    if not all_models:
        print("No models installed. Install one with: ollama pull qwen3.5")
        return

    vision = [m for m in all_models if is_vision_model(m)]
    other = [m for m in all_models if not is_vision_model(m)]

    if vision:
        print("Vision-capable models (usable with ask.py):")
        for name in vision:
            print(f"  {name}")
    else:
        print("No vision-capable models found.")
        print("Install one with: ollama pull qwen3.5")

    if other:
        print("\nOther installed models (text-only, not usable with ask.py):")
        for name in other:
            print(f"  {name}")


# ---------------------------------------------------------------------------
# System info
# ---------------------------------------------------------------------------


def _gb(n: int) -> str:
    return f"{n / 1024 ** 3:.1f} GB"


def cmd_memory() -> None:
    import platform

    system = platform.system()

    if system == "Darwin":
        import subprocess

        try:
            pages_free = 0
            pages_inactive = 0
            page_size = 4096
            result = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=5)
            for line in result.stdout.splitlines():
                if "page size of" in line:
                    page_size = int(line.split()[-2])
                elif line.startswith("Pages free:"):
                    pages_free = int(line.split()[-1].rstrip("."))
                elif line.startswith("Pages inactive:"):
                    pages_inactive = int(line.split()[-1].rstrip("."))
            result2 = subprocess.run(
                ["sysctl", "-n", "hw.memsize"], capture_output=True, text=True, timeout=5
            )
            total = int(result2.stdout.strip())
            available = (pages_free + pages_inactive) * page_size
            pct_free = available / total * 100
            print(f"memory: {_gb(total)} total, {_gb(available)} available ({pct_free:.0f}% free)")
        except Exception as e:
            print(f"memory: unavailable ({e})")

    elif system == "Linux":
        try:
            info = {}
            with open("/proc/meminfo") as f:
                for line in f:
                    key, val = line.split(":")
                    info[key.strip()] = int(val.strip().split()[0]) * 1024
            total = info["MemTotal"]
            available = info.get("MemAvailable", info.get("MemFree", 0))
            pct_free = available / total * 100
            print(f"memory: {_gb(total)} total, {_gb(available)} available ({pct_free:.0f}% free)")
        except Exception as e:
            print(f"memory: unavailable ({e})")

    else:
        print("memory: unavailable (unsupported platform)")


def cmd_storage(path: str = "/") -> None:
    usage = shutil.disk_usage(path)
    pct_free = usage.free / usage.total * 100
    print(f"storage: {_gb(usage.total)} total, {_gb(usage.free)} available ({pct_free:.0f}% free)  [{path}]")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Query an image with a local Ollama vision model.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("image", nargs="?", help="Path to the image file")
    parser.add_argument(
        "shortcut",
        nargs="?",
        choices=["describe"],
        help="Shortcut command (describe = default prompt)",
    )
    parser.add_argument("--prompt", "-p", help="Custom question about the image")
    parser.add_argument("--model", "-m", help="Ollama model name to use")
    parser.add_argument("--list-models", "-l", action="store_true", help="List available vision models and exit")
    parser.add_argument("--memory", action="store_true", help="Show system memory (total / available)")
    parser.add_argument("--storage", action="store_true", help="Show disk storage (total / available)")
    parser.add_argument("--info", action="store_true", help="Show memory + storage + models")
    parser.add_argument("--ping", action="store_true", help="Quick health check — no image needed")

    args = parser.parse_args()

    # --ping
    if args.ping:
        _check_server()
        model = pick_model(args.model)
        cmd_ping(model)
        return

    # --list-models
    if args.list_models:
        cmd_list_models()
        return

    # --info combines memory + storage + models
    if args.info:
        cmd_memory()
        cmd_storage()
        print()
        cmd_list_models()
        return

    # --memory / --storage standalone
    if args.memory or args.storage:
        if args.memory:
            cmd_memory()
        if args.storage:
            cmd_storage()
        return

    # Image query
    if not args.image:
        parser.print_help()
        sys.exit(1)

    image_path = Path(args.image)
    if not image_path.exists():
        print(f"error: file not found: {image_path}", file=sys.stderr)
        sys.exit(1)

    suffix = image_path.suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}:
        print(f"error: unsupported image format: {suffix}", file=sys.stderr)
        sys.exit(1)

    _check_server()
    prompt = args.prompt or DESCRIBE_PROMPT
    model = pick_model(args.model)
    cmd_ask(image_path, prompt, model)


if __name__ == "__main__":
    main()
