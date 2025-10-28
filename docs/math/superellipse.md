# Superellipse Mathematical Reference

## Overview

A **superellipse** (also called **Lamé curve**) is a family of closed curves that generalizes the ellipse. By varying the exponent parameter, superellipses can represent shapes ranging from diamonds to circles to rounded rectangles.

Superellipses are widely used in modern design systems for creating smooth, continuous corners without the visual discontinuities of circular arc-based rounded rectangles.

---

## Terminology Note

The term **"squircle"** specifically refers to the case where **n = 4** (quartic superellipse). However, in design communities, "squircle" is often used loosely to describe any superellipse with smooth corners, including:

- **True squircle**: $n = 4$ (quartic, Lamé's special quartic)
- **Apple's shape**: $n ≈ 5$ (quintic superellipse, NOT technically a squircle)

This document describes the **general superellipse family** and focuses on the **quintic case (n ≈ 5)** commonly used in modern interface design.

---

## Mathematical Definition

A **superellipse** (Lamé curve) centered at the origin is defined as:

$$
\left| \frac{x}{a} \right|^n + \left| \frac{y}{b} \right|^n = 1
$$

Where:

- $a, b$: semi-major and semi-minor axes (when $a = b$, the shape is symmetric)
- $n > 0$: the **exponent** determining the shape's curvature

### Shape Spectrum

The exponent $n$ controls the shape's characteristics:

| Exponent (n) | Shape                  | Description                                        |
| ------------ | ---------------------- | -------------------------------------------------- |
| $n = 1$      | Diamond (rhombus)      | Sharp corners at 45°                               |
| $n = 2$      | Circle (ellipse)       | Perfect circular curvature                         |
| $n = 4$      | **Squircle** (quartic) | Mathematical definition of "squircle"              |
| $n ≈ 5$      | Quintic superellipse   | Apple's iOS/macOS icons (not technically squircle) |
| $n → ∞$      | Rectangle              | Approaches sharp 90° corners                       |

---

## Parametric Form

A parametric representation useful for rendering:

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

For $n ≥ 2$:

- **C¹ continuous** at all points (smooth tangents, no kinks)
- **C^∞ continuous** (infinitely differentiable) everywhere
- Curvature transitions are smooth and continuous

This distinguishes superellipses from arc-based rounded rectangles, which have curvature discontinuities at the points where circular arcs meet straight edges.

### Perceptual Characteristics

- **Higher n values** (4-6): Softer, more organic appearance than circular arcs
- **Avoids optical bulge**: Circular rounded rectangles appear to "bulge" outward; superellipses maintain visual balance
- **Continuous curvature**: No visible transition points between corners and edges

---

## Relation to Rounded Rectangles

| Property             | Rounded Rectangle (arc-based) | Superellipse                                    |
| -------------------- | ----------------------------- | ----------------------------------------------- |
| Mathematical model   | Piecewise (4 lines + 4 arcs)  | Single implicit curve                           |
| Corner transition    | Discrete arc joins            | Continuous curvature                            |
| Curvature continuity | C¹ (curvature discontinuity)  | C^∞ (infinitely smooth)                         |
| Exponent analogy     | Fixed circular (n = 2)        | Variable (typically n = 4-6 for design)         |
| Implementation       | Easier (native primitives)    | Requires exponentiation or Bézier approximation |

---

## Corner Smoothing Parameter

Modern design tools often implement a **corner smoothing parameter** that interpolates between different superellipse exponents.

### Parameter Model

$$
\text{corner\_smoothing} \in [0, 1]
$$

Typical mapping:

- **0.0** → Circular rounded corners ($n = 2$)
- **≈0.6** → Quintic superellipse ($n ≈ 5$), visually matches Apple's icon shape
- **1.0** → Higher exponent (e.g., $n ≈ 10$), approaching rectangular

### Empirical Exponent Mapping

The following $n(s)$ relation is a **heuristic mapping** (not a mathematical standard):

$$
n(s) \approx 2 + 8s^2
$$

Where:

- $s$ is the smoothing factor $\in [0, 1]$
- $n$ is the resulting superellipse exponent

**Note**: This formula is empirical. Adjust constants based on perceptual requirements and testing.

---

## Practical Implementation Notes

### 1. Path Generation

For rendering in systems like **Skia** or **HTML Canvas**, superellipses must be approximated using cubic Bézier curves, as they cannot be represented exactly in most graphics APIs.

**Approximation approach**:

- Use one or two cubic Bézier segments per corner (adaptive to desired accuracy)
- Handle lengths depend on the exponent $n$ and can be precomputed
- Higher $n$ values require more careful approximation

### 2. Optimization Strategy

```rust
if corner_smoothing <= 0.0 {
    // Use SkRRect fast path (circular arcs)
    // Native GPU acceleration
} else {
    // Generate path using superellipse Bézier approximation
    // Custom path rendering
}
```

### 3. Reference Constants

For Apple-style quintic superellipse:

```rust
// Apple's icon shape uses quintic superellipse, not squircle (n=4)
pub const APPLE_ICON_SMOOTHING: f32 = 0.6;  // Heuristic smoothing value
pub const APPLE_ICON_EXPONENT: f32 = 5.0;   // Quintic superellipse
```

For mathematical squircle:

```rust
// True squircle definition (Lamé's special quartic)
pub const SQUIRCLE_EXPONENT: f32 = 4.0;     // Quartic superellipse
```

### 4. Performance Tips

- **Cache paths** per (radius, exponent, smoothing) tuple
- **Precompute Bézier control points** for common $n$ values (2, 4, 5, 6)
- **Use lookup tables** for $|\cos t|^{2/n}$ computations in GPU shaders
- **Tessellation**: For very high precision, consider adaptive tessellation based on curvature

---

## References

- Wikipedia: [Superellipse](https://en.wikipedia.org/wiki/Superellipse)
- Wikipedia: [Squircle](https://en.wikipedia.org/wiki/Squircle)
- Mathworld: [Superellipse](https://mathworld.wolfram.com/Superellipse.html)
- Liam Rosenfeld: [Apple Icon Quest](https://liamrosenfeld.com/posts/apple_icon_quest/)
- Marc Edwards (Bjango): _Continuous Corners in iOS_

---

## Summary

**Superellipses** are a family of curves defined by the equation $\left|\frac{x}{a}\right|^n + \left|\frac{y}{b}\right|^n = 1$.

**Key points**:

- **Squircle** ($n=4$) is ONE specific case, not the general term
- **Apple icons** use $n≈5$ (quintic), which is NOT a squircle
- For design systems, model corner smoothing as a **continuous parameter** rather than Boolean
- Typical smoothing value: **0.6** (heuristic, corresponds to $n≈5$)
- Implement as: `corner_smoothing: f32` with Bézier approximation

**Mathematical precision**: When $n ≥ 2$, superellipses are C^∞ continuous (infinitely differentiable), providing smooth, organic curves superior to arc-based rounded rectangles for interface design.
