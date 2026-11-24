import { describe, expect, it, vi } from "vitest";
import { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import { AgentComposerSubmission } from "./agent-composer-submission";

type Request = AgentComposerSubmission.Request;
type Editor = Request["editor"];

function fixture(
  overrides: Partial<
    Pick<
      Request,
      "busy" | "editing" | "commands" | "draft" | "onCapture" | "allowEmpty"
    >
  > = {}
) {
  let text = "Original draft";
  let revision = 0;
  const setText = (value: string) => {
    text = value;
    revision++;
  };
  const submission = new AgentComposerSubmission();
  submission.mount();
  const request = {
    scope: {},
    isCurrent: vi.fn<Request["isCurrent"]>(() => true),
    canSubmit: true,
    editing: false,
    busy: true,
    awaitSubmission: false,
    allowEmpty: false,
    onSubmit: vi.fn<AgentComposerSubmission.Request["onSubmit"]>(),
    onSubmitError: vi.fn<NonNullable<Request["onSubmitError"]>>(),
    notify: vi.fn<Request["notify"]>(),
    editor: {
      submit: vi.fn<Editor["submit"]>(({ submitted_at }) => ({
        role: "user",
        parts: [{ type: "text", text }],
        meta: { text, attachments: [], submitted_at },
      })),
      readDocument: vi.fn<Editor["readDocument"]>(() => text),
      restoreDocument: vi.fn<Editor["restoreDocument"]>((document) => {
        setText(String(document));
        return true;
      }),
      readHistoryDraft: vi.fn<Editor["readHistoryDraft"]>(() => ({
        document: text,
        attachment: null,
      })),
      guardHistoryDocument: () => {
        const captured = revision;
        return () => captured === revision;
      },
      clear: vi.fn<Editor["clear"]>(() => setText("")),
      clearForHistory: vi.fn<Editor["clearForHistory"]>(() => setText("")),
      focus: vi.fn<Editor["focus"]>(() => true),
    },
    ...overrides,
  } satisfies AgentComposerSubmission.Request;
  return { submission, request, setText, readText: () => text };
}

describe("AgentComposerSubmission", () => {
  it("submits the inline mention with its exact reference and removes both when deleted", async () => {
    const { request, submission } = fixture();
    const skill = {
      name: "slides",
      uri: `grida-skill:slides@${"a".repeat(64)}`,
    };
    const plain = {
      role: "user" as const,
      parts: [{ type: "text" as const, text: "Use $PATH" }],
      meta: {
        markdown: "Use $PATH",
        text: "Use $PATH",
        attachments: [],
        submitted_at: 1,
      },
    };
    const markdown = "Use [$slides](" + skill.uri + ") with $PATH";
    request.editor.submit.mockReturnValue({
      ...plain,
      meta: { ...plain.meta, markdown, text: "Use $slides with $PATH" },
      parts: [
        {
          type: "mention",
          target: {
            id: skill.uri,
            sigil: "$",
            label: skill.name,
            payload: skill,
          },
        },
        ...plain.parts,
      ],
    });
    await submission.submit(request);
    expect(request.onSubmit).toHaveBeenLastCalledWith(
      markdown,
      "Original draft",
      [skill]
    );
    request.editor.submit.mockReturnValue(plain);
    await submission.submit(request);
    expect(request.onSubmit).toHaveBeenLastCalledWith("Use $PATH", "");
  });

  it.each(["accepted", "refused", "unconfirmed"] as const)(
    "clears a dispatched standalone command and preserves the next draft after %s",
    async (result) => {
      const admission = Promise.withResolvers<typeof result>();
      const store = new ComposerDrafts(null, null);
      const { request, submission, setText, readText } = fixture({
        draft: { key: "chat", store },
        commands: [
          {
            id: "compact",
            title: "Compact",
            standalone: true,
            dispatch: () => admission.promise,
            run: () => {
              throw new Error("expected identified command dispatch");
            },
          },
        ],
      });
      setText("/compact");
      store.write("chat", "/compact");
      const sending = submission.submit(request);
      expect(readText()).toBe("");
      expect(store.read("chat")).toBeNull();
      setText("/compact");
      store.write("chat", "/compact");
      admission.resolve(result);
      await sending;
      expect(readText()).toBe("/compact");
      expect(store.read("chat")).toBe("/compact");
      expect(request.editor.restoreDocument).not.toHaveBeenCalled();
      expect(request.onSubmit).not.toHaveBeenCalled();
      expect(submission.read()).toBeNull();
    }
  );

  it("keeps a locally refused command and restores its untouched draft after a host refusal", async () => {
    let offered = false;
    const refused = Promise.withResolvers<"refused">();
    const { request, submission, setText, readText } = fixture({
      commands: [
        {
          id: "compact",
          title: "Compact",
          standalone: true,
          dispatch: () => (offered ? refused.promise : undefined),
          run: () => {},
        },
      ],
    });
    setText("/compact");
    await submission.submit(request);
    expect(readText()).toBe("/compact");
    offered = true;
    const sending = submission.submit(request);
    expect(readText()).toBe("");
    refused.resolve("refused");
    await sending;
    expect(readText()).toBe("/compact");
  });

  it("does not restore a refused command into a new attachment-only draft", async () => {
    const admission = Promise.withResolvers<"refused">();
    const { request, submission, setText, readText } = fixture({
      commands: [
        {
          id: "compact",
          title: "Compact",
          standalone: true,
          dispatch: () => admission.promise,
          run: () => {},
        },
      ],
    });
    let attachment: object | null = null;
    request.editor.readHistoryDraft.mockImplementation(() => ({
      document: readText() || null,
      attachment,
    }));
    setText("/compact");
    const sending = submission.submit(request);
    expect(readText()).toBe("");
    attachment = { name: "next-prompt.png" };
    admission.resolve("refused");
    await sending;
    expect(readText()).toBe("");
    expect(request.editor.restoreDocument).not.toHaveBeenCalled();
  });

  it("admits one pending send and records the acknowledged draft in history", async () => {
    const { request, submission, readText } = fixture();
    const result = Promise.withResolvers<void>();
    request.onSubmit.mockReturnValue(result.promise);
    const send = submission.submit(request);
    await submission.submit(request);
    expect(submission.read()?.scope).toBe(request.scope);
    expect(request.onSubmit).toHaveBeenCalledExactlyOnceWith(
      "Original draft",
      "Original draft"
    );
    expect(readText()).toBe("Original draft");

    result.resolve();
    await send;
    expect(readText()).toBe("");
    expect(request.editor.clearForHistory).toHaveBeenCalledExactlyOnceWith({
      draft: { document: "Original draft", attachment: null },
      text: "Original draft",
    });
    expect(submission.read()).toBeNull();
  });

  it("passes the exact document to the caller for an allowed empty submission", async () => {
    const { request, submission, setText } = fixture({ allowEmpty: true });
    setText("");
    request.editor.readDocument.mockReturnValue(null);
    await submission.submit(request);
    expect(request.onSubmit).toHaveBeenCalledExactlyOnceWith("", null);
    expect(request.editor.clearForHistory).toHaveBeenCalledOnce();
  });

  it("preserves newer editor content, even when the user changed it back", async () => {
    const { request, submission, setText } = fixture();
    const result = Promise.withResolvers<void>();
    request.onSubmit.mockReturnValue(result.promise);
    const send = submission.submit(request);
    setText("An intervening edit");
    setText("Original draft");
    result.resolve();
    await send;
    expect(request.editor.clearForHistory).not.toHaveBeenCalled();
  });

  it.each(["success", "failure"] as const)(
    "ignores a late %s after the ordinary composer is borrowed",
    async (outcome) => {
      const { request, submission, readText } = fixture();
      const result = Promise.withResolvers<void>();
      request.onSubmit.mockReturnValue(result.promise);
      const send = submission.submit(request);
      request.isCurrent.mockReturnValue(false);
      if (outcome === "success") result.resolve();
      else result.reject(new Error("previous send failed"));
      await send;
      expect(readText()).toBe("Original draft");
      expect(request.editor.clearForHistory).not.toHaveBeenCalled();
      expect(request.onSubmitError).not.toHaveBeenCalled();
      expect(request.notify).not.toHaveBeenCalled();
    }
  );

  it("retires the accepted stored draft after switching without clearing the active editor", async () => {
    const store = new ComposerDrafts(null, null);
    store.write("origin", "Original draft");
    const { request, submission, setText, readText } = fixture({
      draft: { key: "origin", store },
    });
    const result = Promise.withResolvers<void>();
    request.onSubmit.mockReturnValue(result.promise);
    const send = submission.submit(request);
    request.isCurrent.mockReturnValue(false);
    setText("Another chat's draft");
    result.resolve();
    await send;
    expect(store.read("origin")).toBeNull();
    expect(readText()).toBe("Another chat's draft");
  });

  it("saves a borrowed message with the ordinary submit intent and preserves it on refusal", async () => {
    const capture = vi.fn<NonNullable<Request["onCapture"]>>(() => true);
    const compact = vi.fn<AgentComposerSubmission.Command["run"]>();
    const beginDocumentSend =
      vi.fn<NonNullable<Request["draft"]>["store"]["beginDocumentSend"]>();
    const settleDocumentSend =
      vi.fn<NonNullable<Request["draft"]>["store"]["settleDocumentSend"]>();
    const { request, submission, readText, setText } = fixture({
      editing: true,
      busy: false,
      commands: [
        { id: "compact", title: "Compact", standalone: true, run: compact },
      ],
      draft: { key: "chat", store: { beginDocumentSend, settleDocumentSend } },
      onCapture: capture,
    });
    const failure = new Error("replacement refused");
    request.onSubmit.mockRejectedValueOnce(failure);
    setText("/compact");
    await submission.submit(request);
    expect(submission.read()).toBeNull();
    expect(request.onSubmitError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(readText()).toBe("/compact");

    setText(" Revised caption ");
    await submission.submit(request);
    expect(request.onSubmit.mock.calls).toEqual([
      ["/compact", "/compact"],
      [" Revised caption ", " Revised caption "],
    ]);
    expect(capture).not.toHaveBeenCalled();
    expect(compact).not.toHaveBeenCalled();
    expect(beginDocumentSend).not.toHaveBeenCalled();
    expect(request.editor.clearForHistory).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "submits the finalized dictation only to the draft that requested it (scope changed: %s)",
    async (changed) => {
      const { request, submission, setText } = fixture({ editing: true });
      let current = request;
      let snapshot = { active: true, sendPending: false };
      const stopAndSend = vi.fn<AgentComposerSubmission.Voice["stopAndSend"]>(
        () => {
          snapshot = { active: true, sendPending: true };
        }
      );
      const voice = { getSnapshot: () => snapshot, stopAndSend };
      submission.request(() => current, voice);
      submission.request(() => current, voice);
      expect(stopAndSend).toHaveBeenCalledOnce();
      expect(request.onSubmit).not.toHaveBeenCalled();

      if (changed) current = { ...request, scope: {} };
      setText("Original draft with dictated words");
      snapshot = { active: false, sendPending: false };
      stopAndSend.mock.calls[0][0]();
      if (changed) expect(request.onSubmit).not.toHaveBeenCalled();
      else
        expect(request.onSubmit).toHaveBeenCalledExactlyOnceWith(
          "Original draft with dictated words",
          "Original draft with dictated words"
        );
      expect(request.editor.clearForHistory).not.toHaveBeenCalled();
    }
  );
});
