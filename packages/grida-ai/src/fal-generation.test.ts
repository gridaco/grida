// GRIDA-SEC-004 — completion facts survive delivery failures without leaking provider bodies.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ImageClient,
  VideoClient,
  MediaOperations,
  ProviderHttp,
} from "./index";
const key = "synthetic-private-key",
  prompt = "synthetic-private-prompt";
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const model = {
  image: "bfl/flux-2-pro",
  video: "google/gemini-omni-1.1-flash",
};
function setup(kind: "image" | "video") {
  const events: string[] = [];
  let jobs = 0;
  const request = vi.fn<typeof fetch>(async (url, init) => {
    if (init?.method === "POST") {
      events.push("submit");
      return Response.json({
        request_id: `job-${++jobs}`,
        status_url: "https://queue.fal.run/job/status",
        response_url: "https://queue.fal.run/job/result",
      });
    }
    if (String(url).endsWith("status"))
      return Response.json({ status: "COMPLETED" });
    return Response.json(
      kind === "image"
        ? { images: [{ url: "https://fal.media/image.png" }] }
        : { video: { url: "https://fal.media/video.mp4" } }
    );
  });
  const download = vi.fn<typeof fetch>(async () => {
    events.push("download");
    return new Response(kind === "image" ? png : new Uint8Array([1, 2, 3]));
  });
  const completed = vi.fn<(receipt: ImageClient.FalCompletion) => void>(
    (receipt) => {
      events.push("completed");
      expect(Object.isFrozen(receipt)).toBe(true);
    }
  );
  const options = {
    keys: { get: () => key },
    http: new ProviderHttp({ request, download }),
    on_fal_completed: completed,
  };
  const client =
    kind === "image" ? new ImageClient(options) : new VideoClient(options);
  return { client, request, download, completed, events };
}
afterEach(() => vi.useRealTimers());
describe("fal completion boundary", () => {
  it.each(["image", "video"] as const)(
    "reports %s completion before download and keeps results byte-only",
    async (kind) => {
      const t = setup(kind),
        operation = await t.client.resolve({
          model_id: model[kind],
          provider: "fal",
        });
      const result = await operation.generate({ prompt });
      expect(t.events).toEqual(["submit", "completed", "download"]);
      expect(t.completed).toHaveBeenCalledExactlyOnceWith({
        provider_id: "fal",
        binding_id: operation.binding_id,
        request_id: "job-1",
        output_count: 1,
      });
      expect(Object.keys(result)).toEqual([
        kind === "image" ? "images" : "videos",
      ]);
      expect(JSON.stringify(t.completed.mock.calls)).not.toContain(key);
      expect(JSON.stringify(t.completed.mock.calls)).not.toContain(prompt);
    }
  );
  it.each(["image", "video"] as const)(
    "retains a completed %s receipt and safe identity after download failure",
    async (kind) => {
      const t = setup(kind);
      t.download.mockRejectedValue(new Error(key + prompt));
      const op = await t.client.resolve({
        model_id: model[kind],
        provider: "fal",
      });
      const failure = await op.generate({ prompt }).catch((error) => error);
      expect(failure.toJSON()).toEqual({
        code: "generation_failed",
        message: "generation_failed",
        task_id: "job-1",
      });
      expect(t.completed).toHaveBeenCalledOnce();
      expect(
        t.request.mock.calls.filter(([, init]) => init?.method === "POST")
      ).toHaveLength(1);
    }
  );
  it.each(["image", "video"] as const)(
    "withholds a %s receipt for invalid output counts",
    async (kind) => {
      const t = setup(kind);
      t.request.mockImplementation(async (url, init) =>
        init?.method === "POST"
          ? Response.json({
              request_id: "job-1",
              status_url: "https://queue.fal.run/job/status",
              response_url: "https://queue.fal.run/job/result",
            })
          : String(url).endsWith("status")
            ? Response.json({ status: "COMPLETED" })
            : Response.json(kind === "image" ? { images: [] } : { videos: [] })
      );
      const op = await t.client.resolve({
        model_id: model[kind],
        provider: "fal",
      });
      await expect(op.generate({ prompt })).rejects.toHaveProperty(
        "task_id",
        "job-1"
      );
      expect(t.completed).not.toHaveBeenCalled();
      expect(t.download).not.toHaveBeenCalled();
    }
  );
  it("sequences single-image endpoint batches and stops after a failed batch", async () => {
    const t = setup("image");
    let downloads = 0;
    t.download.mockImplementation(async () => {
      t.events.push("download");
      if (++downloads === 2) throw new Error("failed");
      return new Response(png);
    });
    const op = await (t.client as ImageClient).resolve({
      model_id: model.image,
      provider: "fal",
    });
    await expect(op.generate({ prompt, n: 4 })).rejects.toHaveProperty(
      "task_id",
      "job-2"
    );
    expect(t.events).toEqual([
      "submit",
      "completed",
      "download",
      "submit",
      "completed",
      "download",
    ]);
    expect(t.completed.mock.calls.map(([r]) => r.request_id)).toEqual([
      "job-1",
      "job-2",
    ]);
    expect(
      t.request.mock.calls.filter(([, init]) => init?.method === "POST")
    ).toHaveLength(2);
  });
  it("retains an accepted video identity on deadline without claiming completion", async () => {
    vi.useFakeTimers();
    const t = setup("video");
    t.request.mockImplementation(async (_url, init) =>
      init?.method === "POST"
        ? Response.json({
            request_id: "job-1",
            status_url: "https://queue.fal.run/job/status",
            response_url: "https://queue.fal.run/job/result",
          })
        : new Promise<Response>(() => {})
    );
    const op = await t.client.resolve({
      model_id: model.video,
      provider: "fal",
    });
    const result = op.generate({ prompt }).catch((error) => error);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(await result).toMatchObject({ code: "timeout", task_id: "job-1" });
    expect(t.completed).not.toHaveBeenCalled();
  });
});
describe("fal documented request mapping", () => {
  const operations = new MediaOperations();
  it.each([
    [
      "google/gemini-omni-1.1-flash",
      "google/gemini-omni-flash/v1.1/text-to-video",
      8,
      8,
    ],
    ["bytedance/seedance-2.0", "bytedance/seedance-2.0/text-to-video", 6, "6"],
    [
      "bytedance/seedance-2.5",
      "bytedance/seedance-2.5/text-to-video",
      20,
      "20",
    ],
    ["google/veo-3.1", "fal-ai/veo3.1", 4, "4s"],
    ["google/veo-3.1-fast", "fal-ai/veo3.1/fast", 6, "6s"],
    ["google/veo-3.1-lite", "fal-ai/veo3.1/lite", 8, "8s"],
    ["alibaba/wan-3.0", "alibaba/wan-3.0/text-to-video", 5, 5],
  ] as const)(
    "maps %s to its exact text endpoint and wire units",
    async (id, binding, duration, wireDuration) => {
      const t = setup("video"),
        op = await t.client.resolve({ model_id: id, provider: "fal" });
      await op.generate({
        prompt,
        duration,
        resolution: "1280x720",
        aspect_ratio: "16:9",
      });
      expect(t.request.mock.calls[0]![0]).toBe(
        `https://queue.fal.run/${binding}`
      );
      expect(JSON.parse(String(t.request.mock.calls[0]![1]!.body))).toEqual({
        prompt,
        duration: wireDuration,
        resolution: "720p",
        aspect_ratio: "16:9",
      });
    }
  );
  it.each([
    { duration: 11 },
    { seed: 0 },
    { fps: 24 },
    { generate_audio: false },
    { resolution: "1024x720" },
    { resolution: "1280x720", aspect_ratio: "9:16" },
  ])(
    "refuses unsupported Omni controls before submission: %j",
    async (input) => {
      const t = setup("video"),
        selector = {
          kind: "video",
          model_id: model.video,
          provider: "fal",
        } as const;
      expect(() =>
        operations.parseInput(selector, { prompt, ...input })
      ).toThrow(MediaOperations.Failure);
      const op = await t.client.resolve({
        model_id: model.video,
        provider: "fal",
      });
      await expect(
        op.generate({ prompt, ...input } as VideoClient.Input)
      ).rejects.toHaveProperty("code", "invalid_input");
      expect(t.request).not.toHaveBeenCalled();
    }
  );
});
