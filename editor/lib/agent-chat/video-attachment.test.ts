import { describe, expect, it, vi } from "vitest";
import { video_attachment } from "./video-attachment";

const POSTER = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";

/** A media element that decodes on request, as Chromium does. */
class StubVideo extends EventTarget implements video_attachment.Element {
  muted = false;
  preload = "";
  playsInline = false;
  duration = Number.NaN;
  videoWidth = 0;
  videoHeight = 0;
  attributes = new Set<string>();
  private time = 0;
  private source = "";

  constructor(
    private readonly clip:
      | { duration: number; width: number; height: number }
      | "undecodable"
      | "silent",
    private readonly seekable = true
  ) {
    super();
  }

  get src() {
    return this.source;
  }
  set src(value: string) {
    this.source = value;
    this.attributes.add("src");
    const clip = this.clip;
    if (clip === "silent") return;
    queueMicrotask(() => {
      if (clip === "undecodable") {
        this.dispatchEvent(new Event("error"));
        return;
      }
      this.duration = clip.duration;
      this.videoWidth = clip.width;
      this.videoHeight = clip.height;
      this.dispatchEvent(new Event("loadedmetadata"));
    });
  }
  get currentTime() {
    return this.time;
  }
  set currentTime(value: number) {
    this.time = value;
    queueMicrotask(() =>
      this.dispatchEvent(new Event(this.seekable ? "seeked" : "error"))
    );
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  load() {}
}

function media(video: StubVideo, posters: string[] = [POSTER]) {
  const drawn: { at: number; width: number; height: number }[] = [];
  const revoked: string[] = [];
  const surface: video_attachment.Media = {
    video: () => video,
    canvas: (width, height) => ({
      width,
      height,
      draw: (source, w, h) =>
        drawn.push({ at: source.currentTime, width: w, height: h }),
      toDataURL: () => posters.shift() ?? POSTER,
    }),
    createObjectURL: () => "blob:clip",
    revokeObjectURL: (url) => revoked.push(url),
  };
  return { surface, drawn, revoked };
}

const clip = new Blob(["not really a movie"], { type: "video/quicktime" });

describe("video_attachment.isVideo", () => {
  it("recognizes videos by type or, without one, by extension", () => {
    expect(
      video_attachment.isVideo({ name: "clip.mov", type: "video/quicktime" })
    ).toBe(true);
    for (const name of ["clip.MOV", "clip.mp4", "clip.m4v", "clip.webm"])
      expect(video_attachment.isVideo({ name, type: "" })).toBe(true);
    expect(video_attachment.isVideo({ name: "clip.mov.txt", type: "" })).toBe(
      false
    );
    expect(
      video_attachment.isVideo({ name: "image.png", type: "image/png" })
    ).toBe(false);
    expect(video_attachment.mediaType({ name: "clip.MOV", type: "" })).toBe(
      "video/quicktime"
    );
  });
});

describe("video_attachment.probe", () => {
  it("reads duration, dimensions and a small poster frame, then releases the clip", async () => {
    const video = new StubVideo({ duration: 12.5, width: 1920, height: 1080 });
    const { surface, drawn, revoked } = media(video);
    expect(await video_attachment.probe(clip, surface)).toEqual({
      poster: POSTER,
      durationMs: 12_500,
      width: 1920,
      height: 1080,
    });
    expect(video.muted).toBe(true);
    expect(drawn).toEqual([{ at: 0.5, width: 320, height: 180 }]);
    expect(revoked).toEqual(["blob:clip"]);
    expect(video.attributes.has("src")).toBe(false);
  });

  it("takes the frame from the middle of a very short clip", async () => {
    const video = new StubVideo({ duration: 0.4, width: 100, height: 200 });
    const { surface, drawn } = media(video);
    await video_attachment.probe(clip, surface);
    expect(drawn).toEqual([{ at: 0.2, width: 100, height: 200 }]);
  });

  it("shrinks a poster that is too large, and omits one that stays too large", async () => {
    const large = `data:image/jpeg;base64,${"A".repeat(video_attachment.MAX_POSTER_BYTES)}`;
    const small = new StubVideo({ duration: 2, width: 640, height: 480 });
    const shrunk = media(small, [large, POSTER]);
    expect((await video_attachment.probe(clip, shrunk.surface))?.poster).toBe(
      POSTER
    );
    expect(shrunk.drawn.map(({ width }) => width)).toEqual([320, 160]);
    const stubborn = new StubVideo({ duration: 2, width: 640, height: 480 });
    expect(
      await video_attachment.probe(
        clip,
        media(stubborn, [large, large]).surface
      )
    ).toEqual({ durationMs: 2000, width: 640, height: 480 });
  });

  it("keeps the facts when the frame cannot be drawn", async () => {
    const video = new StubVideo({ duration: 3, width: 64, height: 64 }, false);
    expect(await video_attachment.probe(clip, media(video).surface)).toEqual({
      durationMs: 3000,
      width: 64,
      height: 64,
    });
  });

  it("leaves out a duration or size the host would not keep", async () => {
    // A corrupt container can report years of footage or a huge frame.
    const endless = new StubVideo({
      duration: 8 * 24 * 60 * 60,
      width: 640,
      height: 360,
    });
    expect(await video_attachment.probe(clip, media(endless).surface)).toEqual({
      poster: POSTER,
      width: 640,
      height: 360,
    });
    const huge = new StubVideo({ duration: 2, width: 16_385, height: 360 });
    expect(await video_attachment.probe(clip, media(huge).surface)).toEqual({
      poster: POSTER,
      durationMs: 2000,
    });
    const bounded = new StubVideo({
      duration: video_attachment.MAX_DURATION_MS / 1000,
      width: video_attachment.MAX_DIMENSION,
      height: video_attachment.MAX_DIMENSION,
    });
    expect(await video_attachment.probe(clip, media(bounded).surface)).toEqual({
      poster: POSTER,
      durationMs: video_attachment.MAX_DURATION_MS,
      width: video_attachment.MAX_DIMENSION,
      height: video_attachment.MAX_DIMENSION,
    });
  });

  it("has no preview for a clip it cannot decode", async () => {
    const video = new StubVideo("undecodable");
    const { surface, revoked } = media(video);
    expect(await video_attachment.probe(clip, surface)).toBeNull();
    expect(revoked).toEqual(["blob:clip"]);
  });

  it("gives up after its timeout", async () => {
    vi.useFakeTimers();
    try {
      const video = new StubVideo("silent");
      const { surface, revoked } = media(video);
      const probed = video_attachment.probe(clip, surface);
      await vi.advanceTimersByTimeAsync(video_attachment.TIMEOUT_MS);
      expect(await probed).toBeNull();
      expect(revoked).toEqual(["blob:clip"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("video_attachment.caption", () => {
  it("shows duration and dimensions as far as they are known", () => {
    expect(
      video_attachment.caption({
        durationMs: 12_500,
        width: 1920,
        height: 1080,
      })
    ).toBe("0:13 · 1920×1080");
    expect(video_attachment.caption({ durationMs: 3_723_000 })).toBe("1:02:03");
    expect(video_attachment.caption({})).toBeUndefined();
  });
});
