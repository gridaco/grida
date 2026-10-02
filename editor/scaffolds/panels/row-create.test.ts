import { afterEach, describe, expect, it, vi } from "vitest";
import { createRow } from "./row-create";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("manual row creation", () => {
  it("submits the original FormData and completes only after a successful response", async () => {
    const data = new FormData();
    data.append("choices", "first");
    data.append("choices", "second");
    data.append("attachment", new File(["contents"], "example.txt"));
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: { id: "row" } }));
    vi.stubGlobal("fetch", request);
    const onSaved = vi.fn<() => void>();

    await createRow("form", data).then(onSaved);

    expect(request).toHaveBeenCalledWith("/v1/submit/form", {
      method: "POST",
      body: data,
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it.each([400, 403, 500])(
    "does not report a rejected submission (%s) as saved",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(Response.json({ error: "rejected" }, { status }))
      );
      const onSaved = vi.fn<() => void>();

      await expect(
        createRow("form", new FormData()).then(onSaved)
      ).rejects.toThrow(`Failed to save row (${status}).`);

      expect(onSaved).not.toHaveBeenCalled();
    }
  );

  it("preserves network failure and does not report the row as saved", async () => {
    const error = new TypeError("Network request failed");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(error));
    const onSaved = vi.fn<() => void>();

    await expect(createRow("form", new FormData()).then(onSaved)).rejects.toBe(
      error
    );

    expect(onSaved).not.toHaveBeenCalled();
  });
});
