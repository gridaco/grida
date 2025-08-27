# @grida/fonts

Grida Fonts package provides utilities for loading and managing Google Fonts using both traditional stylesheet approach and modern FontFace API.

## Features

- **FontFace API Support**: Modern CSS Font Loading API for better performance and control
- **Variable Font Support**: Full support for variable fonts with axes (weight, width, slant, etc.)
- **Width/Stretch Support**: Direct mapping of `wdth` axis values to CSS `font-stretch` percentage values
- **Slant Support**: Mapping of `slnt` axis values to CSS `font-style: oblique` with degree ranges
- **Automatic Format Detection**: Automatically detects font format from URL extension (woff2, woff, ttf, otf, eot)
- **Backward Compatibility**: Traditional stylesheet approach still available
- **TypeScript Support**: Full type safety with TypeScript

## Installation

```bash
pnpm add @grida/fonts
```

## Usage

### FontFace API (Recommended)

The FontFace API provides better performance and control over font loading:

```typescript
import { FontFaceManager, GoogleWebFontListItemWithAxes } from "@grida/fonts";

// Static methods for simple usage
await FontFaceManager.loadFontFamily(font);
await FontFaceManager.loadFontFamilies([font1, font2, font3]);
const isLoaded = FontFaceManager.isFontFamilyLoaded("Roboto");

// Or create an instance for tracking loaded fonts
const fontFaceManager = new FontFaceManager();

// Load a single font family
const font: GoogleWebFontListItemWithAxes = {
  family: "Roboto",
  variants: ["regular", "italic", "700", "700italic"],
  files: {
    regular: "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.ttf",
    italic:
      "https://fonts.gstatic.com/s/roboto/v30/KFOkCnqEu92Fr1Mu51xIIzI.ttf",
    "700":
      "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc9.ttf",
    "700italic":
      "https://fonts.gstatic.com/s/roboto/v30/KFOjCnqEu92Fr1Mu51TzBqZ9.ttf",
  },
  // ... other properties
};

await fontFaceManager.loadFontFamily(font);

// Load multiple font families
await fontFaceManager.loadFontFamilies([font1, font2, font3]);

// Check if a font is loaded
const isLoaded = fontFaceManager.isFontFamilyLoaded("Roboto");
```

### Variable Fonts

For variable fonts with axes:

```typescript
const variableFont: GoogleWebFontListItemWithAxes = {
  family: "Roboto Flex",
  variants: ["regular"],
  files: {
    regular:
      "https://fonts.gstatic.com/s/robotoflex/v29/NaPccZLOBv5T3oB7Cb4i0wu9TsDOCZRS.ttf",
  },
  axes: [
    { tag: "wght", start: 100, end: 1000 },
    { tag: "wdth", start: 25, end: 151 },
    { tag: "slnt", start: -10, end: 0 },
  ],
};

const widthVariableFont: GoogleWebFontListItemWithAxes = {
  family: "Advent Pro",
  variants: ["regular"],
  files: {
    regular:
      "https://fonts.gstatic.com/s/adventpro/v32/V8mqoQfxVT4Dvddr_yOwrzaFxV7JtdQgFqXdUAQrGp_zgX5sWCpLQyN_TZAs.woff2",
  },
  axes: [
    { tag: "wdth", start: 100, end: 200 },
    { tag: "wght", start: 100, end: 900 },
  ],
};

const interFont: GoogleWebFontListItemWithAxes = {
  family: "Inter",
  variants: ["regular", "italic"],
  files: {
    regular:
      "https://fonts.gstatic.com/s/inter/v19/UcCo3FwrK3iLTfvlaQc78lA2.ttf",
    italic:
      "https://fonts.gstatic.com/s/inter/v19/UcCm3FwrK3iLTcvnYwMZ90A2B58.ttf",
  },
  axes: [
    { tag: "wght", start: 100, end: 900 },
    { tag: "opsz", start: 14, end: 32 },
  ],
};

const fontFaceManager = new FontFaceManager();
await fontFaceManager.loadFontFamily(variableFont);
await fontFaceManager.loadFontFamily(widthVariableFont);
await fontFaceManager.loadFontFamily(interFont);
```

#### Width/Stretch Support

The font manager directly maps the `wdth` (width) axis values to CSS `font-stretch` percentage values:

- `wdth: 100` → `font-stretch: 100%`
- `wdth: 125` → `font-stretch: 125%`
- `wdth: 150` → `font-stretch: 150%`
- etc.

This allows you to use CSS `font-stretch` property with variable fonts:

```css
.narrow-text {
  font-stretch: 75%;
}

.wide-text {
  font-stretch: 150%;
}
```

#### Slant Support

The font manager maps the `slnt` (slant) axis values to CSS `font-style: oblique` with degree ranges:

- `slnt: -10 to 0` → `font-style: oblique -10deg 0deg`
- `slnt: 0 to 10` → `font-style: oblique 0deg 10deg`

This allows you to use CSS `font-style: oblique` property with variable fonts:

```css
.slanted-text {
  font-style: oblique -5deg;
}
```

### React Components

React components are available in the editor package. For direct usage, you can create your own React wrapper:

```tsx
import { FontFaceManager } from "@grida/fonts/fontface";

function FontFaceProvider({ fonts, children }) {
  const fontFaceManager = useRef(new FontFaceManager());

  useEffect(() => {
    const loadFonts = async () => {
      await fontFaceManager.current.loadFontFamilies(fonts);
    };
    loadFonts();
  }, [fonts]);

  return children;
}

function App() {
  const fonts = [
    { family: "Roboto" },
    { family: "Open Sans" },
    { family: "Inter" },
  ];

  return (
    <FontFaceProvider fonts={fonts}>
      <YourApp />
    </FontFaceProvider>
  );
}
```

## API Reference

### FontFaceManager

Main class for managing fonts with FontFace API.

#### Static Methods

- `FontFaceManager.loadFontFamily(font: GoogleWebFontListItemWithAxes): Promise<void>`
- `FontFaceManager.loadFontFamilies(fonts: GoogleWebFontListItemWithAxes[]): Promise<void>`
- `FontFaceManager.isFontFamilyLoaded(family: string): boolean`
- `FontFaceManager.unloadFontFamily(family: string): void` (Note: FontFace API doesn't support unloading)

#### Instance Methods

- `loadFontFamily(font: GoogleWebFontListItemWithAxes): Promise<void>`
- `loadFontFamilies(fonts: GoogleWebFontListItemWithAxes[]): Promise<void>`
- `isFontFamilyLoaded(family: string): boolean`
- `getLoadedFontFamilies(): string[]`
- `clear(): void`
