# Paragraph - `emoji-placeholder`

| feature id          | status | description                                  |
| ------------------- | ------ | -------------------------------------------- |
| `emoji-placeholder` | draft  | support custom emoji (image), as placeholder |

---

## `emoji-placeholder` Feature Documentation

### 0) TL;DR

The `emoji-placeholder` feature enables replacing standard emoji characters in text with custom image placeholders. This approach supports consistent, high-quality emoji rendering across platforms by using user-provided images or predefined emoji sets, rather than relying solely on system fonts or platform-dependent emoji rendering.

### 1) Minimal Legal Notes

This feature is designed to be neutral and general-purpose. It does not embed or distribute any proprietary emoji artwork by default. Instead, it allows applications or users to supply their own emoji images, respecting any licensing or copyright requirements associated with those images.

### 2) Use Cases

Many major applications and platforms, including Slack, Discord, and professional design tools like Figma, use similar image-based pipelines to ensure consistent emoji appearance across devices and operating systems. This feature supports similar workflows, enabling:

- Branded or custom emoji sets uploaded by users.
- Uniform emoji rendering in collaborative or cross-platform environments.
- Enhanced control over emoji appearance beyond what system fonts provide.

### 3) Bypass via PNG

There are two main strategies for providing emoji images:

- **Per-emoji PNG hosting:** Each emoji glyph is hosted as an individual PNG file, which can be fetched on demand. This reduces initial load times and bandwidth usage, as only needed emojis are loaded.
- **Local bake:** Alternatively, a local sprite sheet or baked asset can be used, but this increases initial resource size and complexity.

The feature prioritizes on-demand loading of PNGs, combined with caching, to optimize performance and resource usage.

### 4) Text → Emoji Detection

Detecting which parts of the text should be replaced with emoji images involves:

- Identifying emoji clusters, including sequences formed with Zero Width Joiner (ZWJ) characters.
- Handling skin tone modifiers and variation selectors that modify emoji appearance.
- Recognizing custom Unicode ranges specified by the user or application.

This detection ensures accurate substitution of complex emoji sequences, not just single code points.

### 5) Rendering with Paragraph Placeholders

Integration with the Paragraph rendering system (e.g., Skia) is achieved by:

- Replacing detected emoji clusters with placeholders within the text layout.
- These placeholders reserve space and provide metadata for rendering the corresponding emoji image.
- During rendering, the system draws the PNG glyphs in place of the text, ensuring pixel-perfect emoji display.

### 6) Sizing, Quality & Performance

- Emoji images are sized to match the line height or font size for visual consistency.
- High-DPI (device pixel ratio) aware image fetching is supported to ensure crisp rendering on retina or high-resolution displays.
- Lazy loading and caching mechanisms minimize memory usage and improve initial rendering speed.

### 7) Data & Naming Conventions

- Emoji images are typically named or indexed based on their Unicode code points or sequences.
- Custom emoji sets can define their own naming schemes and Unicode ranges.
- The system allows reporting required emoji ranges to facilitate resource preloading or caching strategies.

### 8) Input & Editing

- The feature supports dynamic text input and editing, updating emoji detection and placeholder substitution in real-time.
- Custom emoji can be inserted via special input methods or commands.
- Editing respects the underlying text representation, preserving emoji sequences for compatibility.

### 9) Fallback Plan

- If an emoji image is unavailable or fails to load, the system falls back to rendering the standard Unicode emoji character using the platform font.
- This ensures that text remains readable even if custom images are missing.

### 10) Testing

- Automated tests verify correct detection of emoji sequences, including complex ZWJ and modifier combinations.
- Rendering tests confirm that placeholders are correctly sized and images are displayed in place.
- Performance tests ensure lazy loading and caching behave as expected.

### 11) Rollout & Switches

- The feature can be enabled or disabled via configuration flags or runtime switches.
- Gradual rollout is supported, allowing applications to selectively enable custom emoji rendering.
- Metrics can be collected to monitor usage and performance impact.

---

### Motivation

The motivation behind the `emoji-placeholder` feature is to provide consistent emoji rendering across different platforms and devices without relying solely on system fonts or platform-specific emoji sets. By using image placeholders, applications can achieve uniform emoji appearance, improving user experience and design fidelity. This approach is flexible and supports user-uploaded custom emoji sets or arbitrary Unicode ranges, making it broadly applicable.

### Similarity to Major Design Tools

This method is similar to how major design tools like Figma render emojis in a consistent manner across platforms. By substituting emoji characters with image placeholders, these tools avoid platform-specific variations and ensure that emojis look the same for all users, regardless of their device or operating system.

### Technical Notes

- The API supports user-uploaded emoji images, allowing for personalized or branded emoji sets.
- Custom Unicode ranges can be defined to specify which characters or sequences should be replaced with images.
- The system supports detection of emoji clusters, including sequences with ZWJ, skin tones, and variation selectors.
- Emoji glyph images (typically PNGs) are loaded on demand, not all at once, optimizing performance.
- Caching and device pixel ratio-aware fetching ensure high-quality rendering and efficient resource usage.
- Integration with Paragraph placeholders enables seamless substitution within text layout and rendering pipelines.

---

## Minimal Example

Here's a practical example of how you could implement the `emoji-placeholder` feature:

### Text Input

When you type `:heart:` or the heart emoji ❤️ in your text, the system detects this as an emoji sequence.

### Visual Preview

Here's what the heart emoji looks like when rendered with a custom PNG image:

![Heart Emoji](https://fonts.grida.co/apple/emoji/160/2764.png)

This high-quality image maintains consistent appearance across all platforms, unlike system font emojis which can vary significantly between devices.

> **Note**: This example uses Apple's color emoji style for demonstration purposes. When implementing this feature, you can use your own custom emoji sets, different visual styles, or create platform-agnostic designs that match your application's branding and design language.

### Emoji Detection

The system identifies the heart emoji (Unicode: U+2764) and determines it should be replaced with a custom image placeholder.

### Image Replacement

Instead of rendering the system font emoji, the system:

- Replaces the text with a placeholder that reserves the appropriate space
- Fetches the corresponding PNG image (e.g., from a hosted emoji service)
- Renders the PNG in place of the text character

### Visual Result

The heart emoji ❤️ appears as a crisp, high-quality image that maintains consistent appearance across all platforms and devices, rather than varying based on the user's system font.

### Benefits

- **Consistency**: Same emoji appearance for all users
- **Quality**: High-resolution images that scale properly
- **Customization**: You can use your own emoji sets or hosted services
- **Performance**: Images load on-demand and are cached for efficiency

This approach gives you full control over emoji rendering while maintaining the natural text editing experience users expect.
