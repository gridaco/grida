import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SettingsArchives } from "@/lib/desktop/settings-archives";
import { ArchivedChatsSettings } from "./archived-chats-settings";

it("shows activity dates without inventing archive dates or changing row order", async () => {
  const controller = new SettingsArchives.Controller(() => ({
    list: async () => ({
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
    }),
    unarchive: async () => {},
  }));
  await controller.refresh();
  const html = renderToStaticMarkup(
    <ArchivedChatsSettings controller={controller} />
  );
  expect(html.match(/<time\b/g)).toHaveLength(1);
  expect(html).toContain('dateTime="2026-11-17T03:04:00.000Z"');
  expect(html).toContain('title="Last activity: ');
  expect(html.indexOf("Known activity")).toBeLessThan(
    html.indexOf("Unknown activity")
  );
  expect(html).toContain('aria-label="Unarchive Known activity"');
  expect(html).toContain('aria-label="Unarchive Unknown activity"');
});
