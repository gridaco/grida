import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NativeMessageRevision } from "./native-message-revision";

const draft = {
  messageId: "earlier-request",
  text: "A replacement\nwith two lines",
  subsequentMessages: 2,
  unverified: false,
};

function render(
  changes: Partial<Parameters<typeof NativeMessageRevision>[0]> = {}
) {
  return renderToStaticMarkup(
    <NativeMessageRevision
      draft={draft}
      submitting={false}
      effortAvailable={true}
      disconnected={false}
      onChange={() => {}}
      onCancel={() => {}}
      onSubmit={() => {}}
      {...changes}
    />
  );
}

describe("Native message revision presentation", () => {
  it("replaces the bubble with one multiline editor and explains the edit's effect", () => {
    const html = render();
    expect(html.match(/<form\b/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Replacement message"');
    expect(html).toContain(draft.text);
    expect(html).toContain("and 2 later messages");
    expect(html).toContain("Completed work isn’t undone.");
    expect(html).toContain(">Send</button>");
    expect(html).not.toContain('aria-label="Message text"');
    expect(html).not.toContain("Edit and resubmit");
  });

  it("locks text and Cancel while submission is pending and shows progress", () => {
    const html = render({ submitting: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('readOnly=""');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain("Sending…");
    expect(html).toContain("animate-spin");
  });

  it("keeps an unconfirmed edit frozen while allowing the same request to be retried", () => {
    const html = render({ draft: { ...draft, unverified: true } });
    expect(html).toContain('readOnly=""');
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html).toContain(">Retry edit</button>");
  });

  it("keeps the text available when an unconfirmed edit loses its review", () => {
    const html = render({
      draft: { ...draft, unverified: true, reviewExpired: true },
    });
    expect(html).toContain(draft.text);
    expect(html).toContain("The edit review expired");
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html).not.toContain('readOnly=""');
  });

  it("blocks original Ultra resubmission while its connection is unavailable", () => {
    const html = render({
      draft: { ...draft, effort: "ultra" },
      effortAvailable: false,
    });
    expect(html).toContain("Ultra effort, which is unavailable");
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html).not.toContain('readOnly=""');
  });

  it("keeps empty text editable but refuses empty sends", () => {
    const html = render({ draft: { ...draft, text: "\n  " } });
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html).not.toContain('readOnly=""');
  });
});
