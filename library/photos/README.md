## Setup

```sh
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

## Scripts

**unsplash.py**: Download images from Unsplash.

```sh
python unsplash.py xR4Yt3AEXLY --download --q=regular --access-key="..." --dir=/path/to/out
```

**optimize.py**: Optimize images.

```sh
python optimize.py /path/to/process --output-dir=/path/to/output --max-size=3
```

**metadata.py**: Generate metadata for images.

```sh
python metadata.py /path/to/process
```

outputs `.metadata.json` files.

**describe.py**: Describe images using ollama.

Needs ollama installed. Needs model with vision support.

```sh
python describe.py /path/to/process --model=gemma3:27b
```

outputs `.describe.json` files.

**object.py**: Combines all metadata for library uploads.

```sh
python object.py /path/to/process
```

outputs `.object.json` files.
