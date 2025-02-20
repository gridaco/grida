# Vanilla preview

> Executable web view of the design (vanilla)

![](./docs/assets/example-of-vanilla-preview-on-grida-assistant.png)

## Installation

```sh
yarn add @code-editor/vanilla-preview
```

## Usage

See the [real example on assistant](https://github.com/gridaco/assistant/pull/181).

```tsx
import VanillaPreview from "@code-editor/vanilla-preview";

export default function () {
  const _DEFAULT_MARGIN = 12;
  const _DEFAULT_SHADOW = "0px 4px 64px rgba(160, 160, 160, 0.18)";
  const _DEFAULT_BORDER_RADIUS = 4;

  return (
    <VanillaPreview
      {...previewInfo}
      margin={_DEFAULT_MARGIN}
      borderRadius={_DEFAULT_BORDER_RADIUS}
      boxShadow={_DEFAULT_SHADOW}
    />
  );
}
```

## Disable overflow

## Scaling

## Autoscale with margin value (horizontal margin)

## Todo: Cached preview for optimization

while repositioning, rescaling the html iframe with large content, it may be more performant to cache the preview and use them while transition is happening.

## Used by

- [code.grida.co](https://github.com/gridaco/designto-code)
- [assistant/@ui/previewer](https://github.com/gridaco/assistant)
