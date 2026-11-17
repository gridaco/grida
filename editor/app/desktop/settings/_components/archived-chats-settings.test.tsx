import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { SettingsArchives } from "@/lib/desktop/settings-archives";
import { ArchivedChatsSettings } from "./archived-chats-settings";

vi.mock("@/lib/desktop/settings-archives", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/desktop/settings-archives")>();
  class Controller extends actual.SettingsArchives.Controller {
    readonly read = (): SettingsArchives.State => ({
      supported: true,
      loading: false,
      entries: [
        {
          id: "first-chat",
          title: "Known activity",
          workspace: "Project",
          revision: 1,
          lastActivityAtMs: Date.parse("2026-11-17T03:04:00.000Z"),
        },
        {
          id: "second-chat",
          title: "Unknown activity",
          workspace: "Project",
          revision: 2,
        },
      ],
      nextCursor: null,
      restoring: null,
      unavailableWorkspaces: [],
      error: null,
    });
  }
  return { SettingsArchives: { ...actual.SettingsArchives, Controller } };
});

it("shows activity dates without inventing archive dates or changing row order", () => {
  const html = renderToStaticMarkup(<ArchivedChatsSettings />);
  expect(html.match(/<time\b/g)).toHaveLength(1);
  expect(html).toContain('dateTime="2026-11-17T03:04:00.000Z"');
  expect(html).toContain('title="Last activity: ');
  expect(html.indexOf("Known activity")).toBeLessThan(
    html.indexOf("Unknown activity")
  );
  expect(html).toContain('aria-label="Unarchive Known activity"');
  expect(html).toContain('aria-label="Unarchive Unknown activity"');
});
