// Basic slide templates for the picker. Each template is a self-contained
// 1920×1080 SVG document. The picker grid uses the same SVG for thumbnail
// rendering — keep templates simple, use system-safe fonts, and avoid
// effects that don't read well at small sizes.

import { svgToDataUri } from "../../../_storage/thumbnails";

export { svgToDataUri };

export type SlideTemplate = {
  id: string;
  name: string;
  svg: string;
  /** Precomputed `data:` URI for `<img src>` thumbnails. */
  thumbnailDataUri: string;
};

function tpl(id: string, name: string, svg: string): SlideTemplate {
  return {
    id,
    name,
    svg,
    thumbnailDataUri: svgToDataUri(svg),
  };
}

const BG = "#FAFAFA";
const INK = "#0A0A0A";
const MUTED = "rgba(10,10,10,0.55)";
const FAINT = "rgba(10,10,10,0.35)";
const RULE = "rgba(10,10,10,0.12)";
const ACCENT = "#0A0A0A";
const FONT = "'Helvetica Neue', sans-serif";

// ─── Title / Cover ──────────────────────────────────────────────────────────

const blank = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
</svg>`;

const titleSlide = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="200" font-family="${FONT}" font-size="15" font-weight="700" fill="${MUTED}" letter-spacing="3">INSIGHTS — 2026</text>
  <text font-family="${FONT}" font-size="110" font-weight="800" fill="${INK}" letter-spacing="-3">
    <tspan x="160" y="380">Slide Deck Title</tspan>
  </text>
  <text x="160" y="500" font-family="${FONT}" font-size="26" font-weight="400" fill="${MUTED}">This is just the beginning of something big.</text>
  <text x="160" y="980" font-family="${FONT}" font-size="15" font-weight="400" fill="${FAINT}" letter-spacing="1">May 2026</text>
</svg>`;

const titleCentered = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="960" y="500" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="700" fill="${MUTED}" letter-spacing="3">A PRESENTATION</text>
  <text x="960" y="600" text-anchor="middle" font-family="${FONT}" font-size="96" font-weight="800" fill="${INK}" letter-spacing="-2.5">Centered Title</text>
  <text x="960" y="680" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="400" fill="${MUTED}">A short, memorable subtitle goes here.</text>
</svg>`;

const titleEyebrow = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <rect x="160" y="200" width="48" height="4" fill="${INK}"/>
  <text x="160" y="260" font-family="${FONT}" font-size="20" font-weight="700" fill="${INK}" letter-spacing="2">CHAPTER ONE</text>
  <text font-family="${FONT}" font-size="120" font-weight="800" fill="${INK}" letter-spacing="-3">
    <tspan x="160" y="500">Beginnings,</tspan>
    <tspan x="160" y="640">and what comes next.</tspan>
  </text>
  <text x="160" y="980" font-family="${FONT}" font-size="15" font-weight="400" fill="${FAINT}" letter-spacing="1">grida.co</text>
</svg>`;

// ─── Section dividers ───────────────────────────────────────────────────────

const sectionTitle = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="560" font-family="${FONT}" font-size="92" font-weight="800" fill="${INK}" letter-spacing="-2">Section title</text>
</svg>`;

const sectionTitleWithDescription = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="500" font-family="${FONT}" font-size="80" font-weight="800" fill="${INK}" letter-spacing="-2">Section Title</text>
  <text x="160" y="560" font-family="${FONT}" font-size="26" font-weight="400" fill="${MUTED}">Quick description about the section.</text>
</svg>`;

const sectionTitleBottom = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="860" font-family="${FONT}" font-size="26" font-weight="400" fill="${MUTED}">Quick description about the section.</text>
  <text x="160" y="940" font-family="${FONT}" font-size="80" font-weight="800" fill="${INK}" letter-spacing="-2">Section Title</text>
</svg>`;

const sectionNumbered = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="460" font-family="${FONT}" font-size="280" font-weight="800" fill="${INK}" letter-spacing="-10" opacity="0.12">02</text>
  <text x="160" y="640" font-family="${FONT}" font-size="20" font-weight="700" fill="${MUTED}" letter-spacing="3">SECTION 02</text>
  <text x="160" y="740" font-family="${FONT}" font-size="80" font-weight="800" fill="${INK}" letter-spacing="-2">Numbered section</text>
</svg>`;

// ─── Content ────────────────────────────────────────────────────────────────

const headingBody = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="240" font-family="${FONT}" font-size="64" font-weight="800" fill="${INK}" letter-spacing="-1.5">Heading and body</text>
  <line x1="160" y1="300" x2="1760" y2="300" stroke="${RULE}" stroke-width="1"/>
  <text font-family="${FONT}" font-size="26" font-weight="400" fill="${INK}">
    <tspan x="160" y="400">A paragraph of supporting copy that sits below the heading and</tspan>
    <tspan x="160" y="442">explains the idea in a few honest sentences. Keep it human and</tspan>
    <tspan x="160" y="484">specific — the deck reads better when each slide carries one thought.</tspan>
  </text>
  <text font-family="${FONT}" font-size="22" font-weight="400" fill="${MUTED}">
    <tspan x="160" y="600">Use this layout when the slide is mostly prose and you don't want</tspan>
    <tspan x="160" y="636">columns or bullets to fragment the reading.</tspan>
  </text>
</svg>`;

const bulletList = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="240" font-family="${FONT}" font-size="64" font-weight="800" fill="${INK}" letter-spacing="-1.5">Key points</text>
  <line x1="160" y1="300" x2="1760" y2="300" stroke="${RULE}" stroke-width="1"/>
  <g font-family="${FONT}" font-size="28" font-weight="400" fill="${INK}">
    <circle cx="172" cy="410" r="5" fill="${INK}"/>
    <text x="208" y="420">A first point that introduces the headline idea.</text>
    <circle cx="172" cy="490" r="5" fill="${INK}"/>
    <text x="208" y="500">A second point that adds a supporting detail.</text>
    <circle cx="172" cy="570" r="5" fill="${INK}"/>
    <text x="208" y="580">A third point that takes the argument forward.</text>
    <circle cx="172" cy="650" r="5" fill="${INK}"/>
    <text x="208" y="660">A fourth point that lands the conclusion.</text>
  </g>
</svg>`;

const highlight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="540" font-family="${FONT}" font-size="92" font-weight="800" fill="${INK}" letter-spacing="-2">Highlight</text>
  <text font-family="${FONT}" font-size="28" font-weight="400" fill="${MUTED}">
    <tspan x="1080" y="500">Use this slide to highlight a single,</tspan>
    <tspan x="1080" y="540">important thing. To keep it short and</tspan>
    <tspan x="1080" y="580">sweet, you might link away to relevant</tspan>
    <tspan x="1080" y="620">doc or file.</tspan>
  </text>
</svg>`;

const twoColumn = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="220" font-family="${FONT}" font-size="56" font-weight="800" fill="${INK}" letter-spacing="-1.5">Two columns</text>
  <line x1="160" y1="280" x2="1760" y2="280" stroke="${RULE}" stroke-width="1"/>
  <text x="160" y="380" font-family="${FONT}" font-size="28" font-weight="700" fill="${INK}">Column one</text>
  <text font-family="${FONT}" font-size="22" font-weight="400" fill="${MUTED}">
    <tspan x="160" y="440">A short paragraph that introduces the</tspan>
    <tspan x="160" y="476">first idea or topic on this slide.</tspan>
  </text>
  <text x="1040" y="380" font-family="${FONT}" font-size="28" font-weight="700" fill="${INK}">Column two</text>
  <text font-family="${FONT}" font-size="22" font-weight="400" fill="${MUTED}">
    <tspan x="1040" y="440">A short paragraph that introduces the</tspan>
    <tspan x="1040" y="476">second idea or topic on this slide.</tspan>
  </text>
</svg>`;

const threeColumn = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="220" font-family="${FONT}" font-size="56" font-weight="800" fill="${INK}" letter-spacing="-1.5">Three columns</text>
  <line x1="160" y1="280" x2="1760" y2="280" stroke="${RULE}" stroke-width="1"/>
  <g font-family="${FONT}">
    <text x="160" y="400" font-size="32" font-weight="700" fill="${INK}">01</text>
    <text x="160" y="460" font-size="24" font-weight="700" fill="${INK}">Discover</text>
    <text font-size="20" font-weight="400" fill="${MUTED}">
      <tspan x="160" y="510">Talk to people. Find</tspan>
      <tspan x="160" y="540">the real problem.</tspan>
    </text>

    <text x="720" y="400" font-size="32" font-weight="700" fill="${INK}">02</text>
    <text x="720" y="460" font-size="24" font-weight="700" fill="${INK}">Design</text>
    <text font-size="20" font-weight="400" fill="${MUTED}">
      <tspan x="720" y="510">Sketch the smallest</tspan>
      <tspan x="720" y="540">thing that could work.</tspan>
    </text>

    <text x="1280" y="400" font-size="32" font-weight="700" fill="${INK}">03</text>
    <text x="1280" y="460" font-size="24" font-weight="700" fill="${INK}">Deliver</text>
    <text font-size="20" font-weight="400" fill="${MUTED}">
      <tspan x="1280" y="510">Ship it. Learn what's</tspan>
      <tspan x="1280" y="540">actually true.</tspan>
    </text>
  </g>
</svg>`;

const callout = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="240" font-family="${FONT}" font-size="56" font-weight="800" fill="${INK}" letter-spacing="-1.5">Callout</text>
  <line x1="160" y1="300" x2="1760" y2="300" stroke="${RULE}" stroke-width="1"/>
  <rect x="160" y="420" width="1600" height="320" fill="white" stroke="${RULE}" stroke-width="1"/>
  <rect x="160" y="420" width="6" height="320" fill="${ACCENT}"/>
  <text x="208" y="490" font-family="${FONT}" font-size="20" font-weight="700" fill="${MUTED}" letter-spacing="2">NOTE</text>
  <text font-family="${FONT}" font-size="36" font-weight="600" fill="${INK}" letter-spacing="-0.5">
    <tspan x="208" y="560">The thing worth pausing on.</tspan>
    <tspan x="208" y="612">A single line that earns its own slide.</tspan>
  </text>
  <text x="208" y="690" font-family="${FONT}" font-size="20" font-weight="400" fill="${MUTED}">Add a supporting sentence if it helps — but it usually doesn't.</text>
</svg>`;

const imageAndText = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <rect x="160" y="160" width="760" height="760" fill="white" stroke="${RULE}" stroke-width="1"/>
  <g stroke="${FAINT}" stroke-width="1">
    <line x1="160" y1="160" x2="920" y2="920"/>
    <line x1="920" y1="160" x2="160" y2="920"/>
  </g>
  <text x="540" y="550" text-anchor="middle" font-family="${FONT}" font-size="18" font-weight="400" fill="${FAINT}" letter-spacing="1">IMAGE</text>
  <text x="1000" y="280" font-family="${FONT}" font-size="20" font-weight="700" fill="${MUTED}" letter-spacing="2">EXHIBIT A</text>
  <text x="1000" y="380" font-family="${FONT}" font-size="64" font-weight="800" fill="${INK}" letter-spacing="-1.5">Image + text</text>
  <text font-family="${FONT}" font-size="24" font-weight="400" fill="${INK}">
    <tspan x="1000" y="480">A short, descriptive paragraph that</tspan>
    <tspan x="1000" y="516">sits next to an image. Useful for</tspan>
    <tspan x="1000" y="552">product shots, screenshots, or charts.</tspan>
  </text>
  <text font-family="${FONT}" font-size="20" font-weight="400" fill="${MUTED}">
    <tspan x="1000" y="640">Replace the placeholder on the left</tspan>
    <tspan x="1000" y="672">with your own image asset.</tspan>
  </text>
</svg>`;

// ─── Data ───────────────────────────────────────────────────────────────────

const bigNumber = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="260" font-family="${FONT}" font-size="20" font-weight="700" fill="${MUTED}" letter-spacing="3">A SINGLE METRIC</text>
  <text x="160" y="640" font-family="${FONT}" font-size="360" font-weight="800" fill="${INK}" letter-spacing="-12">97%</text>
  <text font-family="${FONT}" font-size="28" font-weight="400" fill="${MUTED}">
    <tspan x="160" y="760">A short caption that gives the number its</tspan>
    <tspan x="160" y="800">context — what was measured, against what.</tspan>
  </text>
</svg>`;

const statsThree = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="220" font-family="${FONT}" font-size="56" font-weight="800" fill="${INK}" letter-spacing="-1.5">By the numbers</text>
  <line x1="160" y1="280" x2="1760" y2="280" stroke="${RULE}" stroke-width="1"/>
  <g font-family="${FONT}">
    <text x="160" y="560" font-size="140" font-weight="800" fill="${INK}" letter-spacing="-4">12×</text>
    <text x="160" y="620" font-size="22" font-weight="700" fill="${INK}">Faster</text>
    <text font-size="20" font-weight="400" fill="${MUTED}">
      <tspan x="160" y="660">than the previous</tspan>
      <tspan x="160" y="690">render pipeline.</tspan>
    </text>

    <text x="720" y="560" font-size="140" font-weight="800" fill="${INK}" letter-spacing="-4">2.4M</text>
    <text x="720" y="620" font-size="22" font-weight="700" fill="${INK}">Frames</text>
    <text font-size="20" font-weight="400" fill="${MUTED}">
      <tspan x="720" y="660">rendered during</tspan>
      <tspan x="720" y="690">stress testing.</tspan>
    </text>

    <text x="1280" y="560" font-size="140" font-weight="800" fill="${INK}" letter-spacing="-4">99.9%</text>
    <text x="1280" y="620" font-size="22" font-weight="700" fill="${INK}">Pixel parity</text>
    <text font-size="20" font-weight="400" fill="${MUTED}">
      <tspan x="1280" y="660">with the reference</tspan>
      <tspan x="1280" y="690">implementation.</tspan>
    </text>
  </g>
</svg>`;

const comparison = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="220" font-family="${FONT}" font-size="56" font-weight="800" fill="${INK}" letter-spacing="-1.5">Before / After</text>
  <line x1="160" y1="280" x2="1760" y2="280" stroke="${RULE}" stroke-width="1"/>

  <text x="160" y="380" font-family="${FONT}" font-size="18" font-weight="700" fill="${MUTED}" letter-spacing="2">BEFORE</text>
  <rect x="160" y="410" width="720" height="420" fill="white" stroke="${RULE}" stroke-width="1"/>
  <text font-family="${FONT}" font-size="22" font-weight="400" fill="${MUTED}">
    <tspan x="184" y="470">Describe the state of</tspan>
    <tspan x="184" y="506">the world before. Keep</tspan>
    <tspan x="184" y="542">it factual — not a strawman.</tspan>
  </text>

  <text x="960" y="620" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="800" fill="${INK}">→</text>

  <text x="1040" y="380" font-family="${FONT}" font-size="18" font-weight="700" fill="${INK}" letter-spacing="2">AFTER</text>
  <rect x="1040" y="410" width="720" height="420" fill="${INK}"/>
  <text font-family="${FONT}" font-size="22" font-weight="400" fill="white">
    <tspan x="1064" y="470">Describe what changed,</tspan>
    <tspan x="1064" y="506">and the concrete payoff.</tspan>
    <tspan x="1064" y="542">Numbers help if you have them.</tspan>
  </text>
</svg>`;

const barChart = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="200" font-family="${FONT}" font-size="15" font-weight="700" fill="${MUTED}" letter-spacing="3">REVENUE — FY 2026</text>
  <text x="160" y="280" font-family="${FONT}" font-size="56" font-weight="800" fill="${INK}" letter-spacing="-1.5">Quarterly growth</text>

  <g font-family="${FONT}" font-size="16" font-weight="400" fill="${FAINT}" letter-spacing="1">
    <text x="160" y="406" text-anchor="end">100</text>
    <text x="160" y="546" text-anchor="end">75</text>
    <text x="160" y="686" text-anchor="end">50</text>
    <text x="160" y="826" text-anchor="end">25</text>
  </g>

  <g stroke="${RULE}" stroke-width="1">
    <line x1="200" y1="400" x2="1760" y2="400"/>
    <line x1="200" y1="540" x2="1760" y2="540"/>
    <line x1="200" y1="680" x2="1760" y2="680"/>
    <line x1="200" y1="820" x2="1760" y2="820"/>
  </g>
  <line x1="200" y1="820" x2="1760" y2="820" stroke="${INK}" stroke-width="2"/>

  <g fill="${INK}">
    <rect x="280" y="608" width="160" height="212"/>
    <rect x="520" y="496" width="160" height="324"/>
    <rect x="760" y="552" width="160" height="268"/>
    <rect x="1000" y="412" width="160" height="408"/>
    <rect x="1240" y="356" width="160" height="464"/>
    <rect x="1480" y="244" width="160" height="576"/>
  </g>

  <g font-family="${FONT}" font-size="20" font-weight="400" fill="${MUTED}" text-anchor="middle">
    <text x="360" y="880">Q1·24</text>
    <text x="600" y="880">Q2·24</text>
    <text x="840" y="880">Q3·24</text>
    <text x="1080" y="880">Q4·24</text>
    <text x="1320" y="880">Q1·25</text>
    <text x="1560" y="880">Q2·25</text>
  </g>

  <text x="160" y="980" font-family="${FONT}" font-size="18" font-weight="400" fill="${FAINT}">Source: internal billing — values normalized to Q1·24 = 25.</text>
</svg>`;

const lineChart = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="200" font-family="${FONT}" font-size="15" font-weight="700" fill="${MUTED}" letter-spacing="3">LATENCY — P95</text>
  <text x="160" y="280" font-family="${FONT}" font-size="56" font-weight="800" fill="${INK}" letter-spacing="-1.5">Trending down</text>

  <g font-family="${FONT}" font-size="16" font-weight="400" fill="${FAINT}" letter-spacing="1">
    <text x="160" y="406" text-anchor="end">240ms</text>
    <text x="160" y="546" text-anchor="end">180ms</text>
    <text x="160" y="686" text-anchor="end">120ms</text>
    <text x="160" y="826" text-anchor="end">60ms</text>
  </g>

  <g stroke="${RULE}" stroke-width="1">
    <line x1="200" y1="400" x2="1760" y2="400"/>
    <line x1="200" y1="540" x2="1760" y2="540"/>
    <line x1="200" y1="680" x2="1760" y2="680"/>
    <line x1="200" y1="820" x2="1760" y2="820"/>
  </g>
  <line x1="200" y1="820" x2="1760" y2="820" stroke="${INK}" stroke-width="2"/>

  <polyline fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
    points="280,440 520,500 760,560 1000,620 1240,700 1480,740 1620,780"/>
  <g fill="${BG}" stroke="${INK}" stroke-width="3">
    <circle cx="280" cy="440" r="7"/>
    <circle cx="520" cy="500" r="7"/>
    <circle cx="760" cy="560" r="7"/>
    <circle cx="1000" cy="620" r="7"/>
    <circle cx="1240" cy="700" r="7"/>
    <circle cx="1480" cy="740" r="7"/>
    <circle cx="1620" cy="780" r="7"/>
  </g>

  <g font-family="${FONT}" font-size="20" font-weight="400" fill="${MUTED}" text-anchor="middle">
    <text x="280" y="880">Jan</text>
    <text x="520" y="880">Feb</text>
    <text x="760" y="880">Mar</text>
    <text x="1000" y="880">Apr</text>
    <text x="1240" y="880">May</text>
    <text x="1480" y="880">Jun</text>
    <text x="1620" y="880">Jul</text>
  </g>

  <text x="160" y="980" font-family="${FONT}" font-size="18" font-weight="400" fill="${FAINT}">Source: edge metrics — p95 request latency, /api/* aggregate.</text>
</svg>`;

// ─── Story ──────────────────────────────────────────────────────────────────

const quote = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="320" font-family="${FONT}" font-size="180" font-weight="800" fill="${INK}" letter-spacing="-4" opacity="0.15">“</text>
  <text font-family="${FONT}" font-size="48" font-weight="500" fill="${INK}" letter-spacing="-0.5">
    <tspan x="160" y="540">A short quote that captures the</tspan>
    <tspan x="160" y="600">essence of what you want to say.</tspan>
  </text>
  <text x="160" y="700" font-family="${FONT}" font-size="22" font-weight="400" fill="${MUTED}">— Author Name</text>
</svg>`;

const agenda = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="220" font-family="${FONT}" font-size="56" font-weight="800" fill="${INK}" letter-spacing="-1.5">Agenda</text>
  <line x1="160" y1="280" x2="1760" y2="280" stroke="${RULE}" stroke-width="1"/>
  <g font-family="${FONT}" font-size="34" font-weight="500" fill="${INK}">
    <text x="160" y="400"><tspan font-weight="700" fill="${MUTED}">01 — </tspan>Where we are today</text>
    <text x="160" y="480"><tspan font-weight="700" fill="${MUTED}">02 — </tspan>What we shipped this quarter</text>
    <text x="160" y="560"><tspan font-weight="700" fill="${MUTED}">03 — </tspan>What we learned</text>
    <text x="160" y="640"><tspan font-weight="700" fill="${MUTED}">04 — </tspan>What's next</text>
    <text x="160" y="720"><tspan font-weight="700" fill="${MUTED}">05 — </tspan>Open questions</text>
  </g>
</svg>`;

const timeline = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="220" font-family="${FONT}" font-size="56" font-weight="800" fill="${INK}" letter-spacing="-1.5">Timeline</text>
  <line x1="160" y1="280" x2="1760" y2="280" stroke="${RULE}" stroke-width="1"/>

  <line x1="220" y1="600" x2="1700" y2="600" stroke="${RULE}" stroke-width="2"/>
  <g font-family="${FONT}" fill="${INK}">
    <circle cx="280" cy="600" r="10" fill="${INK}"/>
    <text x="280" y="560" text-anchor="middle" font-size="18" font-weight="700" fill="${MUTED}" letter-spacing="2">Q1</text>
    <text x="280" y="660" text-anchor="middle" font-size="22" font-weight="700">Research</text>
    <text x="280" y="700" text-anchor="middle" font-size="18" font-weight="400" fill="${MUTED}">Talk to users</text>

    <circle cx="760" cy="600" r="10" fill="${INK}"/>
    <text x="760" y="560" text-anchor="middle" font-size="18" font-weight="700" fill="${MUTED}" letter-spacing="2">Q2</text>
    <text x="760" y="660" text-anchor="middle" font-size="22" font-weight="700">Prototype</text>
    <text x="760" y="700" text-anchor="middle" font-size="18" font-weight="400" fill="${MUTED}">Ship to staging</text>

    <circle cx="1240" cy="600" r="10" fill="${INK}"/>
    <text x="1240" y="560" text-anchor="middle" font-size="18" font-weight="700" fill="${MUTED}" letter-spacing="2">Q3</text>
    <text x="1240" y="660" text-anchor="middle" font-size="22" font-weight="700">Beta</text>
    <text x="1240" y="700" text-anchor="middle" font-size="18" font-weight="400" fill="${MUTED}">First 50 teams</text>

    <circle cx="1640" cy="600" r="14" fill="white" stroke="${INK}" stroke-width="3"/>
    <text x="1640" y="560" text-anchor="middle" font-size="18" font-weight="700" fill="${MUTED}" letter-spacing="2">Q4</text>
    <text x="1640" y="660" text-anchor="middle" font-size="22" font-weight="700">GA</text>
    <text x="1640" y="700" text-anchor="middle" font-size="18" font-weight="400" fill="${MUTED}">Public launch</text>
  </g>
</svg>`;

// ─── Closing ────────────────────────────────────────────────────────────────

const thankYou = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="960" y="580" text-anchor="middle" font-family="${FONT}" font-size="180" font-weight="800" fill="${INK}" letter-spacing="-5">Thank you.</text>
  <text x="960" y="660" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="400" fill="${MUTED}">Questions, comments, ideas — all welcome.</text>
</svg>`;

const qAndA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="960" y="620" text-anchor="middle" font-family="${FONT}" font-size="320" font-weight="800" fill="${INK}" letter-spacing="-10">Q&amp;A</text>
  <text x="960" y="720" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="400" fill="${MUTED}" letter-spacing="2">OVER TO YOU</text>
</svg>`;

const contact = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <rect width="1920" height="1080" fill="${BG}"/>
  <text x="160" y="220" font-family="${FONT}" font-size="20" font-weight="700" fill="${MUTED}" letter-spacing="3">CONTACT</text>
  <text x="160" y="380" font-family="${FONT}" font-size="92" font-weight="800" fill="${INK}" letter-spacing="-2">Stay in touch.</text>
  <g font-family="${FONT}" font-size="28" fill="${INK}">
    <text x="160" y="540" font-weight="700">Email</text>
    <text x="380" y="540" font-weight="400" fill="${MUTED}">hello@grida.co</text>
    <text x="160" y="600" font-weight="700">Web</text>
    <text x="380" y="600" font-weight="400" fill="${MUTED}">grida.co</text>
    <text x="160" y="660" font-weight="700">Twitter</text>
    <text x="380" y="660" font-weight="400" fill="${MUTED}">@grida_co</text>
    <text x="160" y="720" font-weight="700">GitHub</text>
    <text x="380" y="720" font-weight="400" fill="${MUTED}">github.com/gridaco</text>
  </g>
</svg>`;

// ─── Exports ────────────────────────────────────────────────────────────────

export const BLANK_SLIDE_SVG = blank;
export const TITLE_SLIDE_SVG = titleSlide;

export const SLIDE_TEMPLATES: SlideTemplate[] = [
  tpl("blank", "Blank", blank),
  tpl("title", "Slide Deck Title", titleSlide),
  tpl("title-centered", "Centered title", titleCentered),
  tpl("title-eyebrow", "Title with eyebrow", titleEyebrow),
  tpl("section", "Section title", sectionTitle),
  tpl(
    "section-desc",
    "Section title with description",
    sectionTitleWithDescription
  ),
  tpl("section-bottom", "Section title (bottom)", sectionTitleBottom),
  tpl("section-numbered", "Numbered section", sectionNumbered),
  tpl("heading-body", "Heading and body", headingBody),
  tpl("bullets", "Bullet list", bulletList),
  tpl("highlight", "Highlight", highlight),
  tpl("two-column", "Two columns", twoColumn),
  tpl("three-column", "Three columns", threeColumn),
  tpl("callout", "Callout", callout),
  tpl("image-text", "Image + text", imageAndText),
  tpl("big-number", "Big number", bigNumber),
  tpl("stats-three", "Three stats", statsThree),
  tpl("comparison", "Before / After", comparison),
  tpl("bar-chart", "Bar chart", barChart),
  tpl("line-chart", "Line chart", lineChart),
  tpl("quote", "Quote", quote),
  tpl("agenda", "Agenda", agenda),
  tpl("timeline", "Timeline", timeline),
  tpl("thank-you", "Thank you", thankYou),
  tpl("qanda", "Q&A", qAndA),
  tpl("contact", "Contact", contact),
];
