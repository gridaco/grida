# Apple Color Emoji for Testing

This directory contains a curated selection of Apple Color Emoji images converted to PNG format for use in the Grida project.

## Overview

The emoji assets in this directory are sourced from the [apple-emoji-linux](https://github.com/samuelngs/apple-emoji-linux) project, which provides Apple's high-quality color emoji font converted for Linux systems.

## Purpose

These emoji assets are used within Grida's canvas and editor components to provide:

- Consistent emoji rendering across different platforms
- High-quality emoji graphics for design tools
- Fallback emoji support when system emoji fonts are unavailable

## Contents

- **PNG Images**: Individual emoji characters converted to PNG format
- **Source Reference**: Link to the original apple-emoji-linux repository
- **Index File**: [`index`](./index) - Contains the curated list of 20 emojis included as PNG files under [`/160`](./160) directory

## Usage

The emoji assets in this directory are typically used by:

- Grida Canvas components that need emoji rendering
- Editor tools requiring emoji support
- Cross-platform compatibility layers

## Source Attribution

Original emoji assets are from the [apple-emoji-linux](https://github.com/samuelngs/apple-emoji-linux) project by [samuelngs](https://github.com/samuelngs).

## License

Please refer to the original [apple-emoji-linux](https://github.com/samuelngs/apple-emoji-linux) repository for licensing information regarding the emoji assets.

## Notes

- This is a fixtures directory containing test/development assets
- Emoji files are pre-converted to PNG format for immediate use
- The selection focuses on commonly used emoji characters
- Assets are optimized for Grida's specific use cases

## See Also

- **[Grida Fonts Repository](https://github.com/gridaco/fonts)** - Contains Apple Color Emoji PNG files and implementation tools for Linux compatibility, providing consistent emoji rendering across platforms
- **[fonts.grida.co](https://fonts.grida.co/)** - Live service providing Apple Color Emoji PNG files via URL pattern: `https://fonts.grida.co/apple/emoji/160/[unicode].png`
  - Example: Heart emoji at [`/apple/emoji/160/2764.png`](https://fonts.grida.co/apple/emoji/160/2764.png) ![Heart emoji](https://fonts.grida.co/apple/emoji/160/2764.png)
