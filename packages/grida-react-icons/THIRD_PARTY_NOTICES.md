# Logo sources and attribution

For consumers and maintainers of `@grida/react-icons/logos`. These notices
cover the four marks listed below; third-party artwork and trademarks are
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
