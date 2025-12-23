# Image Tools (for AI)

This document proposes the philosophical basis for image manipulation tools that enable AI agents to generate, enhance, and transform visual content within the design canvas.

## Key Principles

- Provider-agnostic abstraction over external AI image models
- Credit-aware operations with transparent cost management
- Model selection enables quality vs. speed trade-offs
- Seamless integration with canvas-native image nodes

## Tools

---

> **Generation** Tools

### `::generate_image`

This tool generates images from text prompts using external AI image generation models.

It enables the AI agent to create visual content on demand, transforming abstract descriptions into concrete visual assets that can be directly inserted into the canvas.

The tool abstracts over multiple providers and models, each with different characteristics:

- **Speed**: From fastest (flux-schnell, ~3s) to slowest (gpt-image-1, ~1m)
- **Quality**: Balancing prompt adherence, output diversity, and visual fidelity
- **Styles**: Some models support style presets (realistic, illustration, pixel art, etc.)
- **Aspect Ratios**: Models support various aspect ratios within their constraints

The generated images are automatically saved to the library and can be referenced as canvas nodes.

**Notes**

- Supports multiple providers: OpenAI, Replicate
- Model selection determines cost, speed, and quality characteristics
- Generated images are persisted to the library for reuse and versioning
- Respects rate limits and credit allocation

---

> **Enhancement** Tools

### `::upscale`

This tool upscales images to higher resolutions while preserving visual quality.

It uses Real-ESRGAN technology to intelligently increase image dimensions, making low-resolution images suitable for high-fidelity design work without visible artifacts or blur.

The tool enables the AI agent to enhance existing images in the canvas, transforming them from reference-quality assets into production-ready content.

**Notes**

- Supports configurable scale factors (default: 4x)
- Maintains visual quality during upscaling
- Works with any input image format (PNG, JPG, WebP)

### `::remove_background`

This tool removes backgrounds from images, isolating subjects for compositing and layering within designs.

It enables the AI agent to extract foreground elements from existing images, creating transparent assets that can be seamlessly integrated into design compositions.

The tool abstracts over multiple background removal models, each optimized for different use cases:

- General purpose removal for diverse image types
- High-precision removal for complex subjects (hair, transparency, partial occlusion)
- Fast removal for batch processing

**Notes**

- Supports multiple models with different precision/performance characteristics
- Returns transparent PNG images suitable for compositing
- Handles complex edge cases (semi-transparent elements, fine details)

---

## Philosophy

These tools bridge the gap between AI language models and visual design work. They enable AI agents to not just describe visual changes, but to actually generate and manipulate image assets as first-class citizens within the canvas.

By abstracting over provider-specific APIs and model characteristics, the tools present a unified interface that allows AI agents to focus on creative intent rather than technical implementation details.

The credit-aware design ensures that these resource-intensive operations are managed transparently, allowing the system to balance creativity with operational constraints.
