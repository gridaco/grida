# Vanilla preview

![](./docs/assets/example-of-vanilla-preview-on-grida-assistant.png)

## Installation

```sh
yarn add @code-editor/vanilla-preview
```

## Usage

```tsx
import { VanillaPreview } from "@code-editor/vanilla-preview";

export default function () {
  return <VanillaPreview />;
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
