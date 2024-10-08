import React, { createContext, useRef, useState, useEffect } from "react";
import { useAudio } from "react-use";

interface MediaState {
  buffered: any[];
  duration: number;
  paused: boolean;
  muted: boolean;
  time: number;
  volume: number;
  playing: boolean;
}

interface MediaImage {
  sizes?: string;
  src: string;
  type?: string;
}

/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MediaMetadata) */
interface MediaMetadata {
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MediaMetadata/album) */
  album: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MediaMetadata/artist) */
  artist: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MediaMetadata/artwork) */
  artwork: ReadonlyArray<MediaImage>;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MediaMetadata/title) */
  title: string;
}

type MediaSessionState = {
  metadata?: MediaMetadata;
  src: string;
  autoplay: boolean;
};

type MediaSessionContextType = {
  state: MediaState;
  controls: {
    play: () => void;
    pause: () => void;
    seek: (time: number) => void;
  };
};

const MediaSessionContext = createContext<MediaSessionContextType | null>(null);

/**
 * TODO: improvments:
 * drop useAudio and remove react-use (we can implement it ourself + avoid overhead)
 */
function AudioMediaSessionProvider({
  session,
  children,
}: React.PropsWithChildren<{
  session: MediaSessionState;
}>) {
  const [audio, state, controls, ref] = useAudio({
    src: session.src,
    autoPlay: session.autoplay,
    playsInline: true,
  });

  return (
    <MediaSessionContext.Provider value={{ state, controls }}>
      {audio}
      {children}
    </MediaSessionContext.Provider>
  );
}

function useMediaSessionContext() {
  const context = React.useContext(MediaSessionContext);
  if (context === null) {
    throw new Error(
      "useMediaSession must be used within a MediaSessionProvider"
    );
  }
  return context;
}

type UseMediaSession = MediaState & {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
};

function useMediaSession(): UseMediaSession {
  const { state, controls } = useMediaSessionContext();

  return {
    play: controls.play,
    pause: controls.pause,
    seek: controls.seek,
    ...state,
  };
}

export default AudioMediaSessionProvider;
export { useMediaSession };
