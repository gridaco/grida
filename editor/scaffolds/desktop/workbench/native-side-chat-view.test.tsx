import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FakeSideChatParent } from "./side-chat-placement.fixtures";
import { NativeSideChatView } from "./native-side-chat-view";

async function answered() {
  const side = new FakeSideChatParent().open();
  await side.open();
  side.setDraft("What did we decide?");
  await side.ask();
  return side;
}

describe("NativeSideChatView", () => {
  it("shows the exchanges with their actions and fills its container", async () => {
    const side = await answered();
    const html = renderToStaticMarkup(
      <NativeSideChatView side={side} close={() => {}} />
    );
    expect(html).toContain("What did we decide?");
    expect(html).toContain("About What did we decide?");
    expect(html).toContain("Close side chat");
    expect(html).toContain('aria-label="Side chat question"');
    // Placement chrome belongs to the surface that shows the view.
    expect(html).not.toMatch(/max-h-|border-y/);
  });
});
