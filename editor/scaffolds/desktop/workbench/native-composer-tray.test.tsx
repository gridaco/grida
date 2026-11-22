import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@app/ui/components/tooltip";
import type { DragEndEvent } from "@dnd-kit/core";
import type {
  DesktopNativeChat,
  NativeChatQueuePage,
} from "@grida/desktop-bridge";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NativeChatController } from "@/lib/agent-chat/native-chat-controller";
import {
  NativeComposerQueue,
  NativeComposerTray,
} from "./native-composer-tray";

const drag = vi.hoisted(() => ({
  end: undefined as ((event: DragEndEvent) => void) | undefined,
}));
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof actual.DndContext>) => {
      drag.end = props.onDragEnd;
      return <actual.DndContext {...props} />;
    },
  };
});

function render(children: ReactNode): string {
  return renderToStaticMarkup(<TooltipProvider>{children}</TooltipProvider>);
}

const queue: NativeChatQueuePage = {
  items: [
    { inputId: "first", preview: "First message\nSecond line" },
    { inputId: "second", preview: "Second message" },
    {
      inputId: "third",
      preview: "Image message",
      attachments: [{ name: "reference.png", mimeType: "image/png" }],
      textOnly: false,
    },
  ],
  offset: 0,
  previousOffset: null,
  nextOffset: null,
};
function fixture() {
  const controller: NativeComposerQueue.Controller = {
    queueCurrent: true,
    canSteer: false,
    editQueue: vi
      .fn<NativeComposerQueue.Controller["editQueue"]>()
      .mockResolvedValue(),
    showQueuePage: vi
      .fn<NativeComposerQueue.Controller["showQueuePage"]>()
      .mockResolvedValue(),
    readQueuedText: vi
      .fn<NativeComposerQueue.Controller["readQueuedText"]>()
      .mockResolvedValue("Full queued text"),
    readQueuedAttachmentPreview: vi
      .fn<NativeComposerQueue.Controller["readQueuedAttachmentPreview"]>()
      .mockRejectedValue(new Error("No retained preview")),
    canSteerQueued: () => false,
    canEditQueuedText: (item) => !item.goalStart && item.textOnly !== false,
    steerQueued: vi
      .fn<NativeComposerQueue.Controller["steerQueued"]>()
      .mockResolvedValue(null),
    editQueuedText: vi
      .fn<NativeComposerQueue.Controller["editQueuedText"]>()
      .mockResolvedValue(),
  };
  const view: NativeComposerQueue.View = {
    acting: false,
    queueDraft: null,
    queueLoading: false,
  };
  return { controller, view };
}
function ended(active: string, over: string | null): DragEndEvent {
  return {
    active: { id: active },
    over: over === null ? null : { id: over },
  } as DragEndEvent;
}
beforeEach(() => {
  drag.end = undefined;
});

describe("NativeComposerQueue", () => {
  it("renders production queued rows from a narrow local fixture port", () => {
    const { controller, view } = fixture();
    const html = render(
      <NativeComposerQueue
        controller={controller}
        view={view}
        queue={queue}
        count={3}
        onReturnedText={() => {}}
      />
    );
    expect(html).toContain('data-testid="native-composer-queue"');
    expect(html).toContain("First message");
    expect(html).toContain("Second message");
    expect(html).toContain('aria-label="Image attachment"');
    const grips = html.match(
      /<button[^>]*aria-label="Reorder queued message"[^>]*>/g
    )!;
    expect(grips).toHaveLength(3);
    for (const grip of grips) {
      expect(grip).not.toMatch(/class="[^"]*\bhidden\b/);
      expect(grip).toContain("focus-visible:opacity-100");
    }
  });

  it("translates a page-local drag into the correct absolute queue position", () => {
    const { controller, view } = fixture();
    render(
      <NativeComposerQueue
        controller={controller}
        view={view}
        queue={{ ...queue, offset: 5 }}
        count={10}
        onReturnedText={() => {}}
      />
    );
    drag.end!(ended("first", "third"));
    expect(controller.editQueue).toHaveBeenCalledExactlyOnceWith({
      action: "place",
      inputId: "first",
      index: 7,
    });
  });

  it("keeps the edited message in its row without a separate editor and locks its queue actions", () => {
    const { controller, view } = fixture();
    const html = render(
      <NativeComposerQueue
        controller={{
          ...controller,
          canSteer: true,
          canSteerQueued: () => true,
        }}
        view={{
          ...view,
          queueDraft: { inputId: "first", text: "Revised text" },
        }}
        queue={queue}
        count={3}
        onReturnedText={() => {}}
      />
    );
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("First message");
    expect(html).toContain("Editing");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain('aria-label="Edit queued message"');
    expect(html).not.toContain("Revised text");
    expect(html.match(/aria-label="Reorder queued message"/g)).toHaveLength(2);
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)!;
    const firstSteer = buttons.find((button) => button.includes("Steer"))!;
    const firstRemove = buttons.find((button) =>
      button.includes('aria-label="Remove from queue"')
    )!;
    expect(firstSteer).toContain('disabled=""');
    expect(firstRemove).toContain('disabled=""');
    drag.end!(ended("first", "second"));
    expect(controller.editQueue).not.toHaveBeenCalled();
  });

  it("disables steering and withdrawal while an edit is being saved", () => {
    const { controller, view } = fixture();
    const html = render(
      <NativeComposerQueue
        controller={{
          ...controller,
          canSteer: true,
          canSteerQueued: () => true,
        }}
        view={{
          ...view,
          acting: true,
          queueDraft: { inputId: "first", text: "Revised text" },
        }}
        queue={queue}
        count={3}
        onReturnedText={() => {}}
      />
    );
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)!;
    for (const button of buttons.filter(
      (button) =>
        button.includes("Steer") ||
        button.includes('aria-label="Remove from queue"')
    )) {
      expect(button).toContain('disabled=""');
    }
    expect(html).not.toContain('aria-label="Reorder queued message"');
  });

  it.each(["acting", "stale"])(
    "does not dispatch a drag after the queue is locked (%s)",
    (reason) => {
      const { controller, view } = fixture();
      const html = render(
        <NativeComposerQueue
          controller={{ ...controller, queueCurrent: reason !== "stale" }}
          view={{ ...view, acting: reason === "acting" }}
          queue={queue}
          count={3}
          onReturnedText={() => {}}
        />
      );
      expect(html).not.toContain('aria-label="Reorder queued message"');
      drag.end!(ended("first", "third"));
      expect(controller.editQueue).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["first", "first"],
    ["first", null],
    ["missing", "second"],
  ])("ignores a non-move drag (%s, %s)", (active, over) => {
    const { controller, view } = fixture();
    render(
      <NativeComposerQueue
        controller={controller}
        view={view}
        queue={queue}
        count={3}
        onReturnedText={() => {}}
      />
    );
    drag.end!(ended(active!, over));
    expect(controller.editQueue).not.toHaveBeenCalled();
  });

  it("is the queue surface used by the actual composer tray", () => {
    const controller = new NativeChatController({} as DesktopNativeChat);
    const html = render(
      <NativeComposerTray
        controller={controller}
        view={{ ...controller.read(), queue }}
        onReturnedText={() => {}}
        renderOutgoingStatus={() => null}
      />
    );
    expect(html).toContain('data-testid="workspace-composer-tray"');
    expect(html).toContain('data-testid="native-composer-queue"');
    expect(html).toContain("First message");
  });

  it("shows each captured follow-up in the queue from the first send through native admission", () => {
    const controller = new NativeChatController({} as DesktopNativeChat);
    const pending = ["one", "two"].map((id) => ({
      id,
      text: "Same follow-up",
      placement: "queue" as const,
      status: "sending" as const,
    }));
    for (const admitted of [0, 1, 2]) {
      const html = render(
        <NativeComposerTray
          controller={controller}
          view={{
            ...controller.read(),
            queue: admitted
              ? {
                  ...queue,
                  items: pending
                    .slice(0, admitted)
                    .map((item) => ({ inputId: item.id, preview: item.text })),
                }
              : null,
            outgoing: [
              {
                id: "first",
                text: "Initial prompt",
                placement: "transcript",
                status: "accepted",
              },
              ...pending.slice(admitted),
            ],
          }}
          onReturnedText={() => {}}
          renderOutgoingStatus={() => <span>Waiting for admission</span>}
        />
      );
      expect(html).toContain('data-testid="native-composer-queue"');
      expect(html.match(/aria-label="Preview queued message"/g)).toHaveLength(
        2
      );
      expect(html.match(/Same follow-up/g)).toHaveLength(2);
      expect(html.match(/Waiting for admission/g) ?? []).toHaveLength(
        2 - admitted
      );
      expect(html.match(/aria-label="Remove from queue"/g) ?? []).toHaveLength(
        admitted
      );
      expect(html).not.toContain("Initial prompt");
    }
  });
});
