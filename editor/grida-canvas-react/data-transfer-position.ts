type Vector2 = [number, number];

type Size = {
  width: number;
  height: number;
};

export function getCenteredCanvasInsertionPoint(args: {
  clientPosition: Vector2;
  size: Size;
  clientPointToCanvasPoint: (point: Vector2) => Vector2;
}): Vector2 {
  const [x, y] = args.clientPointToCanvasPoint(args.clientPosition);
  return [
    x - getPositiveHalf(args.size.width),
    y - getPositiveHalf(args.size.height),
  ];
}

function getPositiveHalf(value: number): number {
  return Number.isFinite(value) && value > 0 ? value / 2 : 0;
}
