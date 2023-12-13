## Why use html5 video instead of react-player in this place?

_This document is explaining how to use pure HTML5 video instead of react-player, which is the video player used in the project only in the live-design-demo section._

While updating to ios 15 version, some video stuttering in safari was found. For example, let's say you are using the tag below.

```typescript
<ReactPlayer
  url={require("public/videos/video.mp4")}
  loop
  playing
  muted
  playsinline
  config={{
    file: {
      attributes: {
        preload: "auto",
      },
    },
  }}
/>
```

All use the same code as in the example, except for the url, but it has been confirmed that the problem occurs only in the specific location _(the video play only when the video is not visible on the screen)_.

I've tried several tests, such as changing the parent's position, but it's still there. But when I used the video tag in pure html5 there was no problem.
Below is an example used.

```typescript
<video
  src={require("public/videos/video.mp4")}
  autoPlay
  muted
  loop
  playsInline
  preload="auto"
/>
```

So, until the video problem is stable in ios 15 safari, the problematic video from `live-design-demo` is replaced with pure html5 `video` tag.
