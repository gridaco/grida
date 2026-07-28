type ImageGeometry = {
  containerWidth: number;
  containerHeight: number;
  naturalWidth: number;
  naturalHeight: number;
};

/**
 * Immutable camera over a natural-size image.
 *
 * Coordinates map as: screen = natural · scale + (x, y).
 */
export class ImageCamera {
  static readonly #padding = 32;
  static readonly #maxScale = 16;
  static readonly #doubleClickFactor = 2;

  private constructor(
    readonly scale: number,
    readonly x: number,
    readonly y: number,
    private readonly geometry: ImageGeometry
  ) {}

  static fit(geometry: ImageGeometry): ImageCamera {
    const scale = ImageCamera.fitScale(geometry);
    return new ImageCamera(
      scale,
      (geometry.containerWidth - geometry.naturalWidth * scale) / 2,
      (geometry.containerHeight - geometry.naturalHeight * scale) / 2,
      geometry
    );
  }

  get pannable(): boolean {
    return (
      this.geometry.naturalWidth * this.scale >
        this.geometry.containerWidth + 0.5 ||
      this.geometry.naturalHeight * this.scale >
        this.geometry.containerHeight + 0.5
    );
  }

  get transform(): string {
    return `translate(${this.x}px, ${this.y}px) scale(${this.scale})`;
  }

  resize(geometry: ImageGeometry): ImageCamera {
    return ImageCamera.clamp(this.scale, this.x, this.y, geometry);
  }

  panBy(deltaX: number, deltaY: number): ImageCamera {
    return ImageCamera.clamp(
      this.scale,
      this.x + deltaX,
      this.y + deltaY,
      this.geometry
    );
  }

  zoomAt(rawScale: number, px: number, py: number): ImageCamera {
    const scale = Math.min(
      ImageCamera.#maxScale,
      Math.max(ImageCamera.fitScale(this.geometry), rawScale)
    );
    if (scale === this.scale) return this;
    const ratio = scale / this.scale;
    return ImageCamera.clamp(
      scale,
      px - (px - this.x) * ratio,
      py - (py - this.y) * ratio,
      this.geometry
    );
  }

  toggleZoomAt(px: number, py: number): ImageCamera {
    const fit = ImageCamera.fitScale(this.geometry);
    if (this.scale > fit + 1e-3) return ImageCamera.fit(this.geometry);
    const target = Math.min(
      ImageCamera.#maxScale,
      Math.max(1, fit * ImageCamera.#doubleClickFactor)
    );
    return this.zoomAt(target, px, py);
  }

  private static fitScale(geometry: ImageGeometry): number {
    const raw = Math.min(
      (geometry.containerWidth - 2 * ImageCamera.#padding) /
        geometry.naturalWidth,
      (geometry.containerHeight - 2 * ImageCamera.#padding) /
        geometry.naturalHeight
    );
    return Math.min(raw > 0 ? raw : 1, 1);
  }

  private static clamp(
    rawScale: number,
    rawX: number,
    rawY: number,
    geometry: ImageGeometry
  ): ImageCamera {
    const scale = Math.min(
      ImageCamera.#maxScale,
      Math.max(ImageCamera.fitScale(geometry), rawScale)
    );
    const axis = (content: number, view: number, value: number): number => {
      if (content <= view) return (view - content) / 2;
      return Math.min(
        ImageCamera.#padding,
        Math.max(view - content - ImageCamera.#padding, value)
      );
    };
    return new ImageCamera(
      scale,
      axis(geometry.naturalWidth * scale, geometry.containerWidth, rawX),
      axis(geometry.naturalHeight * scale, geometry.containerHeight, rawY),
      geometry
    );
  }
}
