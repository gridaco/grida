# G² Curve Blending

_A.k.a._ **Curvature‑Continuous Corner Blending** (design systems often call this “continuous corner smoothing”).

This document formalizes the problem of replacing a sharp join between two curve segments with a **curvature‑continuous (G²)** transition. It consolidates established techniques from CAGD (Computer Aided Geometric Design) and relates them to practical implementations used in modern editors.

---

## 1. Problem statement

Given two $C^1$ planar curve segments $\gamma_1:[0,1]\!\to\!\mathbb{R}^2$ and $\gamma_2:[0,1]\!\to\!\mathbb{R}^2$ that meet at a vertex $P$ (with incoming unit tangent $\mathbf{t}_1$ and outgoing unit tangent $\mathbf{t}_2$), construct a transition curve $C:[0,1]\!\to\!\mathbb{R}^2$ such that:

- **Positional continuity:** $C(0)=P_1$, $C(1)=P_2$ for trimmed points $P_1\in\gamma_1$, $P_2\in\gamma_2$,
- **Tangent continuity (G¹):** $C'(0)\parallel \mathbf{t}_1$ and $C'(1)\parallel \mathbf{t}_2$,
- **Curvature continuity (G²):** $\kappa_C(0)=\kappa_1(P_1)$ and $\kappa_C(1)=\kappa_2(P_2)$, where $\kappa$ denotes signed curvature.

A normalized **smoothing parameter** $s\in[0,1]$ controls the trim distances along $\gamma_1,\gamma_2$ (and/or a shape parameter), mapping UI intent to geometry. Typical ranges: $s\approx 0.3\!-\!0.7$.

> **Terminology.** $C^k$ denotes equality of derivatives in a fixed parameterization. **$G^k$** denotes geometric continuity (tangent/curvature agreement irrespective of parameterization). For corner blending, $G^2$ is the target.

---

## 2. Curvature formulas used in constraints

For a parametric curve $\mathbf{r}(u)$:

- $\mathbf{T}=\dfrac{\mathbf{r}'}{\|\mathbf{r}'\|}$,  $\kappa=\dfrac{\|\mathbf{r}'\times \mathbf{r}''\|}{\|\mathbf{r}'\|^3}$ (in 2D, treat $\times$ as scalar $x_1y_2-x_2y_1$).

For a **cubic Bézier** $B(u)=\sum_{i=0}^3 \binom{3}{i}(1-u)^{3-i}u^i P_i$:

- $B'(0)=3(P_1-P_0)$,  $B''(0)=6(P_0-2P_1+P_2)$ ⇒
  $\displaystyle \kappa_{B}(0)=\frac{|(P_1-P_0)\times (P_2-2P_1+P_0)|}{\|P_1-P_0\|^3}$.
- Analogously at $u=1$: replace $(P_0,P_1,P_2)$ with $(P_3,P_2,P_1)$.

These formulas make the **G² constraints** algebraic in the control points.

---

## 3. Canonical constructions

### 3.1 Superelliptic fillet (orthogonal or near‑orthogonal edges)

Use a quarter of the **superellipse**:

$$
\left|\frac{x}{a}\right|^n+\left|\frac{y}{b}\right|^n=1,\qquad n\ge 2.
$$

- Parameters $a,b>0$ are trim distances along the two edges; pick $n>2$ for vanishing curvature at the endpoints.
- **Splice property:** at $(a,0)$ and $(0,b)$ the tangent aligns with the axes, and for $n>2$ the curvature tends to $0$, matching the straight‑edge curvature. Thus the splice to straight edges is **$C^2$** (hence $G^2$).
- Special cases: $n=2$ (circular fillet); $n\approx 5$ reproduces Apple‑style “icon” corners.

**Parametrization (first quadrant):**

$$
x(t)=a\,|\cos t|^{2/n},\quad y(t)=b\,|\sin t|^{2/n},\quad t\in[0,\tfrac{\pi}{2}].
$$

**Notes.** This is analytic and extremely stable for rectangles/frames; for highly acute or obtuse angles, prefer §3.2/§3.3.

---

### 3.2 Biarc blends (two circular arcs)

A **biarc** joins two trimmed points by two circular arcs that share a point and tangent.

- Always achieves **$G^1$**; with additional constraints one can equalize curvature at the internal join to approach **$G^2$**, but this is not guaranteed for all angles/lengths.
- Efficient and robust; widely used in CAD/CAM.

Use biarcs when performance and robustness trump strict $G^2$ requirements.

---

### 3.3 Cubic Bézier $G^2$ corner blend (general, Bézier‑native)

Construct two cubics $B_1, B_2$ meeting at a join point $M$:

- Set end points: $B_1(0)=P_1$, $B_1(1)=M$,  $B_2(0)=M$, $B_2(1)=P_2$.
- Align tangents with trimmed edge directions: $P_1^+=P_1+\alpha\,\mathbf{t}_1$,  $P_2^- = P_2-\beta\,\mathbf{t}_2$, with $\alpha,\beta>0$.
- Choose an internal tangent direction $\mathbf{t}_M$ (e.g., angle‑bisector) and set $M^- = M - \mu\,\mathbf{t}_M$, $M^+ = M + \nu\,\mathbf{t}_M$.
- Enforce **$G^1$** at $M$: $B_1'(1)\parallel \mathbf{t}_M \parallel B_2'(0)$.
- Enforce **equal curvature** at $M$ using the endpoint formulas in §2 to solve for $(\mu,\nu)$ (and optionally relate $\alpha,\beta$ to match endpoint curvature to the incident edges).

This yields a strictly **$G^2$** Bézier‑only construction compatible with editors whose primitive is cubic Bézier.

> **Practical recipe.** Given a smoothing amount $s$, set trim distances $d_1=s\,L_1$, $d_2=s\,L_2$ along the incident segments (lengths $L_i$). Take $\alpha=k_1 d_1$, $\beta=k_2 d_2$ with constants tuned for visual uniformity (e.g., $k_1=k_2\approx \tfrac{2}{3}$). Solve for $(\mu,\nu)$ so that $\kappa_{B_1}(1)=\kappa_{B_2}(0)$.

---

### 3.4 Clothoid (Euler‑spiral) blends (analytic $G^2$ with linear curvature)

A **clothoid** has curvature varying linearly with arc length: $\kappa(s)=\kappa_0+\lambda s$.

- Connect two trimmed points by a pair (or a single) clothoid segment(s) meeting $G^2$ conditions.
- Position is expressed via **Fresnel integrals**. This is a classic choice in road/rail design and robotics for fair transitions.

Clothoids are highly aesthetic and strictly $G^2$, but involve special functions.

---

## 4. Smoothing parameterization

Expose a UI parameter $s\in[0,1]$ and map it to geometric quantities:

- **Trim lengths:** $d_i = s\,\min(\alpha L_i,\, d_{\max})$ (clamped for short edges).
- **Superelliptic $n$ (optional):** a monotone heuristic such as $n(s)=2+8s^2$ (documented as heuristic; not a standard).
- **Angle adaptivity:** reduce $s$ for very acute/concave corners to prevent self‑intersection.

---

## 5. Robustness & implementation notes

- **Concave corners.** Place the blend along the interior bisector; clamp trim to avoid inversion/self‑intersection.
- **Curved inputs.** Either flatten to a polyline (fast), or compute blends in the tangent frames of the original curves (higher fidelity).
- **Stroking.** Offset by re‑tessellating the **blended fill outline** at stroke width; do not assume parallel curves.
- **Caching.** Cache per (path hash, $s$, mode) and per common angle buckets.

---

## 6. Relationship to common terms

- **Rounded corners (circular fillet):** $G^1$ only, constant radius.
- **Superellipse / squircle:** a global analytic curve; the quarter‑superellipse in §3.1 provides an analytic $C^\infty$ fillet for orthogonal edges.
- **“Figma corner smoothing”:** a **Bézier‑based $G^2$ corner blend** akin to §3.3 (two cubics per corner with a smoothing factor).

---

## 7. Modes (for engines)

```rust
pub enum CornerBlendMode {
    /// General-purpose, Bézier-native G² construction (two cubics).
    BezierG2,
    /// Analytic superelliptic fillet for (near) orthogonal edges.
    Superelliptic,
    /// Biarc (fast, robust G¹; near-G² with tuning).
    Biarc,
    /// Clothoid-based (analytic G²; uses Fresnel integrals).
    Clothoid,
}
```

---

## 8. References (selected)

- Farin, _Curves and Surfaces for CAGD_ — curve continuity and Bézier endpoint curvature.
- Hoschek & Lasser, _Fundamentals of Computer Aided Geometric Design_ — blending and fairness.
- Meek & Walton, “Approximating smooth planar curves by arc splines,” _J. Comput. Appl. Math._, 1994 — biarcs.
- Ahn et al., “Interpolating clothoid splines,” _Graphical Models_, 2011 — clothoid blends and Fresnel integrals.
- Lamé, “Memoire sur la théorie des surfaces isothermes,” 1818 — superellipse.
