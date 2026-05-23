/**
 * Default SVG document loaded into the /svg playground.
 *
 * Subject: "Observatory No. 7" — a poster-style celestial composition with a
 * typographic lockup. The piece is intentionally designed to look like a real
 * authored illustration (not a demo grid) while exercising the kinds of SVG
 * constructs hand-authored / exported SVGs actually contain in the wild:
 *
 *   - nested <g> with composed transforms (translate/rotate/scale/matrix)
 *   - <defs> with <linearGradient>, <radialGradient>, <pattern>
 *   - <symbol> + <use xlink:href> for star repetition
 *   - <clipPath> (planet limb) and <mask> (sun glow falloff)
 *   - mixed paint: solid, gradient-ref, fill="none", stroke variants
 *     including stroke-linecap, stroke-linejoin, stroke-dasharray
 *   - <text> with font-family / size / weight / letter-spacing / text-anchor
 *     and inline <tspan>
 *   - <path> with M/L/C/Q/A/Z commands (curves + arcs)
 *   - <polygon> and <polyline>
 *   - non-uniform viewBox (0 0 800 600)
 *   - cascade conflicts: style="..." vs presentation attribute on the same
 *     element; inline <style> with class selectors
 *   - currentColor; mix of % and absolute units
 *   - opacity < 1 and fill-opacity < 1 on different elements
 *
 * This fixture is allowed (encouraged, even) to exercise features the editor
 * does not yet handle — the editor should grow to fit real SVGs, not the
 * other way around. If something breaks while loading this, that is a bug to
 * file, not a reason to dumb the fixture down.
 */

export default `<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  viewBox="0 0 800 600"
  width="100%"
  height="100%"
  color="#f4d27a"
>
  <style>
    .frame-rule { stroke: #f4d27a; stroke-width: 1; fill: none; opacity: 0.55; }
    .label { font-family: "Georgia", serif; fill: #f4d27a; }
    .mono { font-family: "Menlo", "Monaco", monospace; fill: #f4d27a; letter-spacing: 0.18em; }
    .hairline { stroke: #f4d27a; stroke-width: 0.5; fill: none; }
    .planet-ring { fill: none; stroke: #f4d27a; stroke-width: 1.2; opacity: 0.7; }
  </style>

  <defs>
    <linearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#06091f" />
      <stop offset="55%" stop-color="#0d1640" />
      <stop offset="100%" stop-color="#1a2456" />
    </linearGradient>

    <radialGradient id="sun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff2c4" />
      <stop offset="40%" stop-color="#f4b04a" />
      <stop offset="100%" stop-color="#b3501a" stop-opacity="0" />
    </radialGradient>

    <radialGradient id="planetBody" cx="35%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#e9c87a" />
      <stop offset="55%" stop-color="#a86b2b" />
      <stop offset="100%" stop-color="#3a1c0c" />
    </radialGradient>

    <linearGradient id="horizon" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1a2456" stop-opacity="0" />
      <stop offset="100%" stop-color="#050714" />
    </linearGradient>

    <pattern id="terrain" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
      <rect width="14" height="14" fill="#0a0f24" />
      <path d="M 0 7 L 14 7" stroke="#f4d27a" stroke-width="0.4" opacity="0.35" />
      <circle cx="3" cy="11" r="0.6" fill="#f4d27a" opacity="0.4" />
      <circle cx="10" cy="3" r="0.4" fill="#f4d27a" opacity="0.25" />
    </pattern>

    <symbol id="star" viewBox="-5 -5 10 10" overflow="visible">
      <polygon
        points="0,-4 1,-1 4,-1 1.6,0.8 2.5,3.8 0,2 -2.5,3.8 -1.6,0.8 -4,-1 -1,-1"
        fill="currentColor"
      />
    </symbol>

    <symbol id="tick" viewBox="0 0 10 10" overflow="visible">
      <line x1="5" y1="0" x2="5" y2="10" stroke="currentColor" stroke-width="1" />
    </symbol>

    <clipPath id="planetClip">
      <circle cx="555" cy="245" r="78" />
    </clipPath>

    <mask id="sunFalloff" maskUnits="userSpaceOnUse" x="0" y="0" width="800" height="600">
      <rect x="0" y="0" width="800" height="600" fill="black" />
      <circle cx="180" cy="170" r="170" fill="url(#sun)" />
    </mask>

    <clipPath id="frameClip">
      <rect x="40" y="40" width="720" height="520" rx="6" />
    </clipPath>
  </defs>

  <!-- Background sky -->
  <rect x="0" y="0" width="800" height="600" fill="url(#sky)" />

  <!-- Star field, clipped to inside the frame -->
  <g clip-path="url(#frameClip)" opacity="0.95">
    <g color="#f4f1e6">
      <use xlink:href="#star" x="120" y="90" width="6" height="6" />
      <use xlink:href="#star" x="240" y="60" width="4" height="4" opacity="0.7" />
      <use xlink:href="#star" x="320" y="110" width="3" height="3" opacity="0.5" />
      <use xlink:href="#star" x="430" y="80" width="5" height="5" />
      <use xlink:href="#star" x="510" y="130" width="3" height="3" opacity="0.6" />
      <use xlink:href="#star" x="640" y="75" width="7" height="7" />
      <use xlink:href="#star" x="700" y="160" width="4" height="4" opacity="0.7" />
      <use xlink:href="#star" x="90" y="200" width="3" height="3" opacity="0.5" />
      <use xlink:href="#star" x="380" y="200" width="3" height="3" opacity="0.45" />
      <use xlink:href="#star" x="270" y="240" width="2" height="2" opacity="0.6" />
      <use xlink:href="#star" x="460" y="260" width="4" height="4" opacity="0.55" />
      <use xlink:href="#star" x="720" y="280" width="3" height="3" opacity="0.5" />
      <use xlink:href="#star" x="150" y="300" width="2" height="2" opacity="0.4" />
    </g>
  </g>

  <!-- Soft sun haze, painted through a radial mask -->
  <rect x="0" y="0" width="800" height="600" fill="#f4b04a" mask="url(#sunFalloff)" opacity="0.85" />

  <!-- Concentric orbit rings, group transformed as a whole -->
  <g transform="translate(180 170) rotate(-12)" class="planet-ring">
    <ellipse cx="0" cy="0" rx="120" ry="38" />
    <ellipse cx="0" cy="0" rx="170" ry="54" opacity="0.5" />
    <ellipse cx="0" cy="0" rx="225" ry="72" opacity="0.3" />
  </g>

  <!-- Planet, with clipped surface pattern + atmosphere ring -->
  <g transform="translate(0 0)">
    <circle cx="555" cy="245" r="78" fill="url(#planetBody)" />
    <g clip-path="url(#planetClip)">
      <rect x="470" y="160" width="180" height="180" fill="url(#terrain)" opacity="0.55" />
      <!-- bands across the planet, drawn with quadratic curves -->
      <path d="M 477 230 Q 555 218 633 232 T 633 250" stroke="#3a1c0c" stroke-width="3" fill="none" opacity="0.6" />
      <path d="M 480 265 Q 555 255 630 268" stroke="#3a1c0c" stroke-width="2" fill="none" opacity="0.45" />
      <path d="M 485 290 Q 555 282 625 293" stroke="#3a1c0c" stroke-width="1.5" fill="none" opacity="0.35" />
    </g>
    <!-- atmosphere -->
    <circle cx="555" cy="245" r="78" fill="none" stroke="#f4d27a" stroke-width="1" opacity="0.6" />
    <circle cx="555" cy="245" r="84" fill="none" stroke="#f4d27a" stroke-width="0.4" opacity="0.35" />
  </g>

  <!-- Planet ring (Saturn-style), drawn as an arc path that goes behind+in-front via two pieces -->
  <g transform="translate(555 245) rotate(18)">
    <!-- back half: behind the planet, so just an arc -->
    <path
      d="M -130 0 A 130 26 0 0 1 130 0"
      fill="none" stroke="#f4d27a" stroke-width="6" opacity="0.55"
    />
    <!-- front half overlaps planet -->
    <path
      d="M 130 0 A 130 26 0 0 1 -130 0"
      fill="none" stroke="#f4d27a" stroke-width="8" opacity="0.85"
    />
    <path
      d="M -150 0 A 150 30 0 0 1 150 0"
      fill="none" stroke="#f4d27a" stroke-width="1.2" opacity="0.5" stroke-dasharray="4 6"
    />
  </g>

  <!-- Constellation line, polyline with dashed stroke and round joins -->
  <polyline
    points="80,360 140,330 210,355 270,320 340,345 410,310"
    fill="none"
    stroke="#f4d27a"
    stroke-width="1.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-dasharray="2 5"
    opacity="0.8"
  />
  <g fill="#f4f1e6">
    <circle cx="80" cy="360" r="2.2" />
    <circle cx="140" cy="330" r="2.6" />
    <circle cx="210" cy="355" r="2.2" />
    <circle cx="270" cy="320" r="3" />
    <circle cx="340" cy="345" r="2.2" />
    <circle cx="410" cy="310" r="2.8" />
  </g>

  <!-- Distant mountain silhouette (polygon), with a horizon fade on top -->
  <g transform="translate(0 0)">
    <polygon
      points="0,470 70,420 130,445 200,395 270,440 340,405 410,455 480,410 560,440 640,400 720,445 800,420 800,600 0,600"
      fill="#0a0f24"
    />
    <rect x="0" y="380" width="800" height="120" fill="url(#horizon)" opacity="0.6" />
  </g>

  <!-- Foreground ground with a vector pattern, partially transparent -->
  <rect
    x="0"
    y="500"
    width="800"
    height="100"
    fill="url(#terrain)"
    fill-opacity="0.55"
    style="fill-opacity: 0.85"
  />

  <!-- Decorative frame -->
  <g class="frame-rule">
    <rect x="40" y="40" width="720" height="520" rx="6" />
    <rect x="48" y="48" width="704" height="504" rx="4" stroke-width="0.5" />
  </g>

  <!-- Corner tick marks via <use> of the tick symbol, each rotated -->
  <g color="#f4d27a">
    <use xlink:href="#tick" x="35" y="35" width="10" height="10" />
    <use xlink:href="#tick" x="755" y="35" width="10" height="10" transform="rotate(90 760 40)" />
    <use xlink:href="#tick" x="755" y="555" width="10" height="10" transform="rotate(180 760 560)" />
    <use xlink:href="#tick" x="35" y="555" width="10" height="10" transform="rotate(270 40 560)" />
  </g>

  <!-- Compass / measurement medallion: deeply nested groups with composed transforms -->
  <g transform="translate(120 470)">
    <g transform="rotate(-8) scale(1 1)">
      <circle cx="0" cy="0" r="44" fill="#0a0f24" stroke="#f4d27a" stroke-width="1" />
      <circle cx="0" cy="0" r="36" class="hairline" />
      <g transform="rotate(0)">
        <line x1="0" y1="-44" x2="0" y2="-34" stroke="#f4d27a" stroke-width="1.2" />
        <line x1="0" y1="44" x2="0" y2="34" stroke="#f4d27a" stroke-width="1.2" />
        <line x1="-44" y1="0" x2="-34" y2="0" stroke="#f4d27a" stroke-width="1.2" />
        <line x1="44" y1="0" x2="34" y2="0" stroke="#f4d27a" stroke-width="1.2" />
      </g>
      <g transform="rotate(45)">
        <line x1="0" y1="-40" x2="0" y2="-34" stroke="#f4d27a" stroke-width="0.6" />
        <line x1="0" y1="40" x2="0" y2="34" stroke="#f4d27a" stroke-width="0.6" />
        <line x1="-40" y1="0" x2="-34" y2="0" stroke="#f4d27a" stroke-width="0.6" />
        <line x1="40" y1="0" x2="34" y2="0" stroke="#f4d27a" stroke-width="0.6" />
      </g>
      <!-- needle, matrix transform: rotate ~22deg, slight skew, slight scale -->
      <g transform="matrix(0.927 0.375 -0.375 0.927 0 0)">
        <polygon points="0,-32 4,0 0,4 -4,0" fill="#f4d27a" />
        <polygon points="0,32 4,0 0,-4 -4,0" fill="#a86b2b" fill-opacity="0.85" />
        <circle cx="0" cy="0" r="2.5" fill="#06091f" stroke="#f4d27a" stroke-width="0.8" />
      </g>
      <text x="0" y="-50" class="mono" font-size="6" text-anchor="middle">N</text>
    </g>
  </g>

  <!-- Typographic lockup -->
  <g transform="translate(400 130)">
    <text
      x="0"
      y="0"
      text-anchor="middle"
      class="label"
      font-size="14"
      font-weight="400"
      letter-spacing="0.42em"
      style="fill: #f4d27a; opacity: 0.85"
    >
      EST. MMXXVI
    </text>
  </g>

  <g transform="translate(400 410)">
    <text
      x="0"
      y="0"
      text-anchor="middle"
      font-family="Georgia, serif"
      font-size="68"
      font-weight="700"
      fill="#f4f1e6"
      letter-spacing="0.02em"
      opacity="0.95"
    >
      <tspan fill="#f4f1e6">Observatory</tspan>
      <tspan dx="14" fill="#f4d27a" font-style="italic" font-weight="400">No. 7</tspan>
    </text>
    <text
      x="0"
      y="34"
      text-anchor="middle"
      class="mono"
      font-size="11"
      style="letter-spacing: 0.42em; fill: currentColor"
    >
      A FIELD GUIDE TO THE NIGHT SKY
    </text>
  </g>

  <!-- Lower-left meta plate -->
  <g transform="translate(72 522)">
    <rect x="0" y="0" width="190" height="24" rx="2" fill="#0a0f24" stroke="#f4d27a" stroke-width="0.6" />
    <text x="10" y="16" class="mono" font-size="9">PLATE 07 / 24</text>
    <line x1="100" y1="6" x2="100" y2="18" stroke="#f4d27a" stroke-width="0.5" opacity="0.6" />
    <text x="110" y="16" class="mono" font-size="9" fill-opacity="0.75">N 41° 24'</text>
  </g>

  <!-- Lower-right signature plate, mixes presentation attribute + style cascade -->
  <g transform="translate(728 528) rotate(-2)">
    <text
      x="0"
      y="0"
      text-anchor="end"
      font-family="Georgia, serif"
      font-style="italic"
      font-size="13"
      fill="#a86b2b"
      style="fill: #f4d27a; opacity: 0.8"
    >
      — drawn by hand, 2026
    </text>
  </g>

  <!-- A small detail rosette built from a path with arc + cubic commands -->
  <g transform="translate(670 470) rotate(12) scale(0.9)">
    <path
      d="M 0 -28
         C 12 -28 22 -18 22 -6
         A 22 22 0 1 1 -22 -6
         C -22 -18 -12 -28 0 -28 Z"
      fill="none" stroke="#f4d27a" stroke-width="1" opacity="0.7"
    />
    <path
      d="M -14 -6 Q 0 8 14 -6"
      fill="none" stroke="#f4d27a" stroke-width="1" stroke-linecap="round"
    />
    <circle cx="0" cy="-6" r="2" fill="#f4d27a" />
    <circle cx="0" cy="-6" r="6" fill="none" stroke="#f4d27a" stroke-width="0.4" opacity="0.6" />
  </g>

  <!-- Falling-star streak: a polyline + a leading dot -->
  <g opacity="0.9">
    <polyline
      points="600,90 640,130 660,158"
      fill="none"
      stroke="#f4f1e6"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-dasharray="1 3 8 4"
    />
    <circle cx="660" cy="158" r="2.4" fill="#f4f1e6" />
  </g>
</svg>
`;
