export function get_boinding_box({
  xywh,
  scale,
}: {
  xywh: [number, number, number, number];
  scale: number;
}): [number, number, number, number] {
  const [x, y, w, h] = xywh;

  // return the bounding box in [number, number, number, number] form with givven x, y, w, h, rotation and scale.
  const [x1, y1, x2, y2] = [
    x * scale,
    y * scale,
    x * scale + w * scale,
    y * scale + h * scale,
  ];
  return [x1, y1, x2, y2];
}
