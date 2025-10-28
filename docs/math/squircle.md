# Squircle (Superellipse) Mathematical Reference

## Overview

A **squircle** is a shape intermediate between a square and a circle, forming a smooth, continuous curve with no discrete corners. It is mathematically modeled as a special case of the **superellipse** (or Lamé curve), and is widely used in design systems such as **Apple's iOS icons**.

---

## Mathematical Definition

A general **superellipse** (Lamé curve) centered at the origin is defined as:

$$
\left| \frac{x}{a} \right|^n + \left| \frac{y}{b} \right|^n = 1
$$

Where:

- $a, b$: semi-major and semi-minor axes (for a squircle, usually $a = b$)
- $n > 0$: the **exponent** determining the shape's curvature

### Common cases

| Shape                      | Exponent (n) | Description                                                                    |
| -------------------------- | ------------ | ------------------------------------------------------------------------------ |
| Circle                     | 2            | Perfect circular curvature                                                     |
| Apple squircle             | ≈ 5          | Used in iOS/macOS app icons (approximation; not officially specified by Apple) |
| Rounded rectangle (approx) | → ∞          | Approaches square corners                                                      |

Thus, the **squircle** can be seen as a **superellipse with n ≈ 5**.

---

## Parametric Form

A parametric form is useful for rendering:

$$
\begin{align}
x(t) &= a \cdot \text{sgn}(\cos t) \cdot |\cos t|^{2/n} \\
y(t) &= b \cdot \text{sgn}(\sin t) \cdot |\sin t|^{2/n}
\end{align}
$$

Where $t \in [0, 2\pi]$.

This formulation provides a smooth, continuous path for rasterization or vector path generation.

---

## Visual Properties

### Continuity

- **C¹ continuous** at all points (smooth tangents)
- smooth (C^∞) curvature; curvature is continuous everywhere for n ≥ 2.

### Perceptual result

- Softer and more organic than circular arcs
- Used to avoid the “optical bulge” of simple rounded rectangles

---

## Relation to Rounded Rectangles

| Property             | Rounded Rectangle            | Squircle                                        |
| -------------------- | ---------------------------- | ----------------------------------------------- |
| Corner transition    | Arc joins (circular)         | Continuous curvature (superelliptic)            |
| Edge definition      | Piecewise (4 lines + 4 arcs) | Single implicit curve                           |
| Curvature continuity | C¹ (discontinuous curvature) | C² (smooth curvature)                           |
| Math simplicity      | Easier                       | Requires exponentiation or Bézier approximation |

---

## Corner Smoothing Parameter

Modern design tools implement a **corner smoothing parameter** that blends between a rounded rectangle and a squircle.

### Parameter model

$$
\text{corner\_smoothing} \in [0, 1]
$$

- **0.0** → Pure circular rounded rect
- ≈0.6 → visually matches Apple‑style icon masks (heuristic; fits often correspond to n ≈ 5).
- **1.0** → Maximum smoothing (approaching uniform superellipse)

The following n(s) relation is a heuristic mapping (not standard).

Empirical mapping between smoothing factor $s$ and superellipse exponent $n$:

$$
n(s) \approx 2 + 8s^2
$$

Adjust constants as needed for perceptual fit.

---

## Practical Implementation Notes

### 1. Path Generation

For rendering in systems like **Skia** or **HTML Canvas**, you’ll need to approximate the superellipse using cubic Béziers.

A full squircle corner can be composed of one or two cubic Bézier segments per corner (adaptive to desired accuracy). The handle length depends on the smoothing parameter and can be precomputed for performance.

### 2. Optimization Strategy

```rust
if corner_smoothing <= 0.0 {
    // Use SkRRect fast path
} else {
    // Generate path using superellipse / Bézier approximation
}
```

### 3. Constants for Apple‑like Squircles

```rust
pub const SQUIRCLE_SMOOTHING_APPLE: f32 = 0.6;
pub const SQUIRCLE_EXPONENT_APPLE: f32 = 5.0;
```

### 4. Performance Tips

- Cache paths per (radius, smoothing) pair
- Precompute control-point ratios for common smoothing values
- Approximate exponentiation with lookup tables for GPU shaders

---

## References

- Wikipedia: [Superellipse / Squircle](https://en.wikipedia.org/wiki/Squircle)
- Liam Rosenfeld: [Apple Icon Quest](https://liamrosenfeld.com/posts/apple_icon_quest/)
- Marc Edwards (Bjango): _Continuous Corners in iOS_

---

**Summary:**  
A _squircle_ is a superellipse ($n≈5$) used to achieve continuous, organic corners.  
In design engines, model it as a rectangle with a **continuous smoothing factor** rather than a Boolean — `corner_smoothing: f32`.  
A common visual default is ≈ 0.6 (heuristic, matches Apple‑style corners).
