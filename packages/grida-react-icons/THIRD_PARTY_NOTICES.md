# Logo sources and attribution

For consumers and maintainers of `@grida/react-icons/logos`. These notices
cover the marks listed below; third-party artwork and trademarks are
not relicensed by the package's MIT license.

## Blender

- Component: `BlenderLogo` (`src/logos/blender.tsx`).
- Source: [Blender's official SVG symbol](https://www.blender.org/wp-content/themes/bthree/assets/icons/favicon.svg).
- Owner and guidelines: [Blender Foundation — logo usage](https://www.blender.org/about/logo/).
- Conversion: removed editor metadata and unused IDs; retained the source
  viewBox, paths, transforms, and brand colors.

## Godot

- Component: `GodotLogo` (`src/logos/godot.tsx`).
- Source: [Godot's official colored SVG icon](https://godotengine.org/assets/press/icon_color.svg),
  from the [Godot press kit](https://godotengine.org/press/).
- Godot Engine Logo, Copyright (c) 2017 Andrea Calabró.
- Licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
  [Upstream license notice](https://github.com/godotengine/godot/blob/master/misc/logo/LICENSE.txt).
- Conversion: added a viewBox matching the source's 1024 × 1024 canvas;
  retained the paths, transforms, and brand colors.

## Unity

- Component: `UnityLogo` (`src/logos/unity.tsx`).
- Source: [Unity's official website SVG](https://cdn.sanity.io/images/fuvbjjlp/production/fa8e822f74dc0dc469801f15ac53859e00318ee2-264x97.svg).
- Owner and guidelines: [Unity — branding and trademarks](https://unity.com/legal/branding-trademarks).
- Conversion: extracted the cube symbol subpath from the logo and cropped
  the viewBox to its native aspect ratio; geometry is unchanged. Monochrome
  fill uses `currentColor` in accordance with the package convention.

## Unreal Engine

- Component: `UnrealEngineLogo` (`src/logos/unreal-engine.tsx`).
- Source: Epic Games' `UE-Icon-2023-Black.svg`, obtained through **Download →
  All original extensions** for **Unreal Engine icon - black** in the
  [official brand library](https://brand.epicgames.com/document/488).
- Owner and guidelines: [Epic Games — Unreal Engine logo](https://brand.epicgames.com/document/383#/logos/unreal-engine-logo).
- Conversion: removed editor metadata, redundant groups, and stylesheet;
  retained the source viewBox and path with inline fill/clip rules.
  Monochrome fill uses `currentColor` in accordance with the package convention.

Unreal® and Unreal Engine® are trademarks or registered trademarks of Epic
Games, Inc. in the United States of America and elsewhere.

All four components accept native SVG props and use intrinsic dimensions
for convenient rendering. Retrieved October 4, 2026.

## Codex

- Component: `CodexLogo` (`src/logos/codex.tsx`).
- Source: [LobeHub Codex SVG](https://github.com/lobehub/lobe-icons/blob/63c800e3db6427b3f156f7b88d426ccb3f7277a1/packages/static-svg/icons/codex.svg),
  pinned to revision `63c800e3db6427b3f156f7b88d426ccb3f7277a1`.
- Collection license: [MIT, Copyright (c) 2023 LobeHub](https://github.com/lobehub/lobe-icons/blob/master/LICENSE).
- The Codex name and mark are OpenAI trademarks. The collection's license
  does not grant trademark rights; see [OpenAI's brand guidelines](https://openai.com/brand/).
- Conversion: retained the 24 × 24 viewBox and exact path geometry;
  removed the title and layout styles, added native SVG props, and used
  `currentColor` for monochrome rendering. Retrieved October 4, 2026.

### LobeHub license notice

MIT License

Copyright (c) 2023 LobeHub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
