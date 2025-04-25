import click
from PIL import Image
from pathlib import Path

QUALITY = 80


def preserve_exif(src_img: Image.Image, dst_path: str, quality: int):
    exif = src_img.info.get("exif")
    if exif:
        src_img.save(dst_path, format='JPEG', quality=quality,
                     optimize=True, exif=exif)
    else:
        src_img.save(dst_path, format='JPEG', quality=quality, optimize=True)


@click.command()
@click.argument('input_dir', type=click.Path(exists=True, file_okay=False))
@click.option('--output-dir', type=click.Path(file_okay=False), default=None, help="Directory to save optimized images")
@click.option('--max-size', type=float, default=3.0, show_default=True, help="Max file size in MiB")
@click.option('--skip-optimized', is_flag=True, default=False, help="Skip copying already optimized images to output directory")
def optimize_images(input_dir, output_dir, max_size, skip_optimized):
    max_bytes = int(max_size * 1024 * 1024)
    input_path = Path(input_dir)
    output_path = Path(output_dir) if output_dir else input_path / 'out'
    output_path.mkdir(parents=True, exist_ok=True)

    for input_file in input_path.glob('*.jpg'):
        process_file(input_file, output_path, max_bytes, not skip_optimized)
    for input_file in input_path.glob('*.jpeg'):
        process_file(input_file, output_path, max_bytes, not skip_optimized)


def process_file(input_file: Path, output_dir: Path, max_bytes: int, copy_optimized: bool):
    output_file = output_dir / input_file.name
    with Image.open(input_file) as img:
        img = img.convert("RGB")
        exif = img.info.get("exif")
        ratio = 1.0
        while True:
            temp_img = img.resize(
                (int(img.width * ratio), int(img.height * ratio)))
            if exif:
                temp_img.save(output_file, format='JPEG',
                              quality=QUALITY, optimize=True, exif=exif)
            else:
                temp_img.save(output_file, format='JPEG',
                              quality=QUALITY, optimize=True)
            if output_file.stat().st_size <= max_bytes or ratio < 0.2:
                break
            ratio *= 0.9  # scale down 90% each time
        orig = input_file.stat().st_size
        new = output_file.stat().st_size
        click.echo(
            f"{input_file.name}: {orig // 1024}KB → {new // 1024}KB (resized to {int(ratio * 100)}%)")


if __name__ == '__main__':
    optimize_images()
