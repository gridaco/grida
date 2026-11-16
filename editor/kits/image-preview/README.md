# `@/kits/image-preview`

Drop-in fullscreen inspection for one image. It owns only local preview state
and browser export actions; it has no agent, workspace, route, or global-state
dependency.

```tsx
import { FullscreenImagePreview } from "@/kits/image-preview";

<FullscreenImagePreview src={src} alt="Preview">
  <img src={src} alt="Preview" />
</FullscreenImagePreview>;
```

Viewport behavior lives in the shared `ZoomableImage` component and immutable
`ImageCamera` backend.

For retained images, pass `loadImage` in place of `src`. The loader runs
when the preview opens and returns a Blob. The preview releases its display
URL on close. Copy and Download use the loaded bytes directly.
