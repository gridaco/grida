# Grida Standard Library

Grida Standard Library is a 100% free & open-source handpicked collection of design assets used by our Editor and our AI.

- fonts
- shapes
- symbols
- logos
- patterns
- wallpapers
- icons
- colors
- sizes
- objects
- components
- styles
- illustrations
- 3d-illustrations
- doodles
- scribbles

## (Working Draft) - API comming soon.

## The Asset Object Model

```json
{
  "object": "o",
  "id": "o_x1234",
  "name": "logo-grida.svg",
  "description": "Grida logo svg with black path fill",
  "type": "application/svg+xml",
  "keywords": ["logo", "grida"],
  "categories": ["logos"],
  "author": {
    "name": "Grida",
    "url": "https://grida.co/grida"
  },
  "version": 1,
  "width": 64,
  "height": 64,
  "bytes": 1234,
  "url": "https://grida.co/library/v1/o_x1234",
  "urls": {
    "raw": "https://grida.co/library/v1/o_x1234"
  },
  "transparency": true,
  "visual_padding": [2, 2, 2, 2],
  "color": "#000000",
  "colors": ["#000000"],
  "background": "#FFFFFF",
  "svg": "<svg>...</svg>",
  "score": 0.5,
  "year": 2025,
  "created_at": 1677610602,
  "updated_at": 1677610602
}
```

## Metadata

- generator - the generator used to create the asset

  - grida-canvas
  - the-bundle
  - dall-e-3
  - midjourney
  - photoshop

- entropy - the visual complexity of the design
  - 0 ~ 1
