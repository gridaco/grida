import cmath from "@grida/cmath";

export function animateTransformTo(
  from: cmath.Transform,
  to: cmath.Transform,
  update: (t: cmath.Transform) => void
) {
  const duration = 200; // ms
  const start = performance.now();

  function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }

  function step(now: number) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);

    const next: cmath.Transform = [
      [0, 0, 0],
      [0, 0, 0],
    ] as cmath.Transform;

    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) {
        next[i][j] = lerp(from[i][j], to[i][j], progress);
      }
    }

    update(next);

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}
