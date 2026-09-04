# `@/kits/audio-player`

For Grida feature authors who need single-track playback, this kit is a
drop-in player for one audio source. It owns playback, seeking, volume,
metadata loading, object URL cleanup, and its neutral artwork placeholder. It
has no model, storage, route, or desktop dependency.

The source may be a browser-loadable URL or a `Blob`/`File`. Product-specific
metadata and side effects stay with the consumer:

```tsx
import { FolderSearch } from "lucide-react";
import { AudioPlayer } from "@/kits/audio-player";

<AudioPlayer
  source={file}
  title="Generated track"
  subtitle="Lyria"
  eyebrow="AI generated track"
  details="track.mp3 · MP3 audio"
  actions={[
    {
      label: "Show in Finder",
      icon: <FolderSearch aria-hidden />,
      onSelect: revealStoredFile,
    },
  ]}
/>;
```

Pass `artwork={{ src, alt }}` when real artwork is available. Without it, the
kit renders a deliberate, platform-neutral music placeholder.
