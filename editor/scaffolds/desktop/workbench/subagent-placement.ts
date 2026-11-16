import type { NativeChatView } from "@/lib/agent-chat/native-chat-controller";
import type { NativeSubagentController } from "@/lib/agent-chat/native-subagent-controller";

/** Where the selected parent chat's requested subagent viewer is presented. */
export interface SubagentPlacement {
  /** Present or reveal the viewer after an explicit request. */
  present(presentation: SubagentPlacement.Presentation): void;
  /** Remove this parent's viewer without changing its work. */
  withdraw(): void;
}

export namespace SubagentPlacement {
  export type Presentation = Readonly<{
    controller: NativeSubagentController;
    /** Grows on explicit presentation requests, never on live observations. */
    focus: number;
    /** Dismiss only this still-current presentation; no child work is stopped. */
    close(): void;
  }>;

  export type Parent = Readonly<{
    subscribe(listener: () => void): () => void;
    read(): Pick<NativeChatView, "subagents">;
  }>;

  /**
   * Follow presentation requests, not live data updates. The content observes
   * its controller directly, so polling never reclaims the selected tab.
   */
  export function connect(
    parent: Parent,
    placement: SubagentPlacement
  ): () => void {
    type Binding = {
      controller: NativeSubagentController;
      unsubscribe(): void;
      shown: boolean;
      focus: number | null;
    };
    let current: Binding | undefined;
    let stopped = false;

    const withdraw = () => {
      const previous = current;
      current = undefined;
      previous?.unsubscribe();
      if (!previous?.shown) return;
      previous.shown = false;
      placement.withdraw();
    };
    const syncChild = (binding: Binding) => {
      const { controller } = binding;
      if (
        stopped ||
        current !== binding ||
        parent.read().subagents !== controller
      )
        return;
      const view = controller.read();
      if (!view.open) {
        if (binding.shown) {
          binding.shown = false;
          binding.focus = null;
          placement.withdraw();
        }
        return;
      }
      if (binding.shown && binding.focus === view.focus) return;
      binding.shown = true;
      binding.focus = view.focus;
      placement.present({
        controller,
        focus: view.focus,
        close: () => {
          if (
            stopped ||
            current !== binding ||
            !binding.shown ||
            parent.read().subagents !== controller ||
            controller.read().focus !== view.focus ||
            !controller.read().open
          )
            return;
          controller.toggle();
        },
      });
    };
    const syncParent = () => {
      if (stopped) return;
      const controller = parent.read().subagents;
      if (current?.controller === controller) return;
      withdraw();
      // A placement may synchronously dismiss or change the parent while
      // withdrawing. Never install a binding over that newer selection.
      if (
        stopped ||
        current ||
        !controller ||
        parent.read().subagents !== controller
      )
        return;
      const binding: Binding = {
        controller,
        unsubscribe: () => {},
        shown: false,
        focus: null,
      };
      current = binding;
      binding.unsubscribe = controller.subscribe(() => syncChild(binding));
      syncChild(binding);
    };
    const unsubscribe = parent.subscribe(syncParent);
    syncParent();
    return () => {
      if (stopped) return;
      stopped = true;
      unsubscribe();
      withdraw();
    };
  }
}
