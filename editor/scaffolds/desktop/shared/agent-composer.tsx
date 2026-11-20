"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  GlobeIcon,
  GoalIcon,
  ImageIcon,
  LibraryIcon,
  ListChecksIcon,
  PaperclipIcon,
} from "lucide-react";
import {
  AgentComposerInput,
  type AgentComposerInputProps,
} from "./agent-composer-input";
import { AgentComposerTools } from "./agent-composer-tools";
import { NativeModelPicker } from "../workbench/native-chat-controls";
import type { ComposerMenuAction } from "@/kits/composer";

/** The Desktop composer; surfaces provide capabilities and submission, not UI variants. */
export function AgentComposer({
  actions,
  commands = [],
  model,
  access,
  modelLeading,
  intents = [],
  ...input
}: AgentComposer.Props) {
  const menu: ComposerMenuAction[] = [];
  if (actions.files)
    menu.push({
      id: "files",
      title: "Files",
      icon: <PaperclipIcon />,
      ...actions.files,
    });
  if (actions.image)
    menu.push({
      id: "image",
      title: "Image",
      icon: <ImageIcon />,
      ...actions.image,
    });
  if (actions.library)
    menu.push({
      id: "library",
      title: "Library",
      icon: <LibraryIcon />,
      ...actions.library,
    });
  if (actions.goal && actions.goal.offered !== false)
    menu.push({
      id: "goal",
      title: "Goal",
      description: "Set a goal to keep pursuing",
      icon: <GoalIcon />,
      disabled: actions.goal.disabled || actions.goal.active,
      onSelect: () => actions.goal?.onChange(true),
    });
  const webSearch = actions.webSearch;
  if (webSearch?.offered || webSearch?.unavailable)
    menu.push({
      id: "webSearch",
      title: "Web search",
      description:
        webSearch.unavailable === "reauthenticationRequired"
          ? "Sign in to ChatGPT again to search the web"
          : webSearch.unavailable
            ? "Check availability again"
            : "Search the web for this message",
      icon: <GlobeIcon />,
      disabled:
        webSearch.disabled ||
        webSearch.unavailable === "reauthenticationRequired" ||
        (!webSearch.unavailable && webSearch.active),
      onSelect: webSearch.unavailable
        ? webSearch.refresh
        : () => webSearch.onChange(true),
    });
  if (actions.plan && actions.plan.offered !== false)
    menu.push({
      id: "plan",
      title: "Plan mode",
      description: actions.plan.active
        ? "Turn plan mode off"
        : "Turn plan mode on",
      icon: <ListChecksIcon />,
      disabled: actions.plan.disabled,
      onSelect: () => actions.plan?.onChange(!actions.plan.active),
    });

  const chips: AgentComposerTools.Intent[] = [];
  if (actions.webSearch?.active)
    chips.push({
      id: "webSearch",
      label: "Web search",
      icon: <GlobeIcon />,
      disabled: actions.webSearch.removeDisabled,
      onRemove: () => actions.webSearch?.onChange(false),
    });
  if (actions.plan?.active)
    chips.push({
      id: "plan",
      icon: <ListChecksIcon />,
      label: "Plan",
      disabled: actions.plan.disabled,
      onRemove: () => actions.plan?.onChange(false),
    });
  if (actions.goal?.active)
    chips.push({
      id: "goal",
      icon: <GoalIcon />,
      label: "Goal",
      // Entry can be unavailable while removing the selected intent stays valid.
      disabled: actions.goal.removeDisabled,
      onRemove: () => actions.goal?.onChange(false),
    });

  return (
    <AgentComposerInput
      {...input}
      commandActions={commands.map((command) => ({
        ...command,
        title: command.id,
        description: COMMAND_DESCRIPTIONS[command.id],
        standalone: true,
      }))}
      onCommandSelect={(selected) => {
        const command = commands.find(
          (candidate) => candidate.id === selected.id
        );
        if (!command || !IMMEDIATE_COMMANDS.has(command.id)) return false;
        void Promise.resolve(command.run()).catch(() => {});
        return true;
      }}
      toolbarStart={
        <AgentComposerTools
          actions={menu}
          access={access}
          intents={[...chips, ...intents]}
        ></AgentComposerTools>
      }
      toolbarEnd={
        <>
          {modelLeading}
          <NativeModelPicker {...model} />
        </>
      }
    />
  );
}

export namespace AgentComposer {
  export type CommandId =
    | "plan"
    | "goal"
    | "side"
    | "stop"
    | "compact"
    | "fork";
  export type Command = Readonly<{
    id: CommandId;
    run(): void | Promise<void>;
  }>;
  export type Action = Readonly<{
    disabled?: boolean;
    onSelect(): void;
  }>;
  export type Mode = Readonly<{
    active: boolean;
    /** A selected intent can still be removed when its action is unavailable. */
    offered?: boolean;
    disabled?: boolean;
    removeDisabled?: boolean;
    onChange(active: boolean): void;
  }>;
  export type Actions = Readonly<{
    files?: Action;
    image?: Action;
    library?: Action;
    plan?: Mode;
    webSearch?: Mode & {
      unavailable?: "unavailable" | "reauthenticationRequired";
      refresh(): void;
    };
    goal?: Mode;
  }>;
  export type Props = Omit<
    AgentComposerInputProps,
    "toolbarStart" | "toolbarEnd" | "commandActions" | "onCommandSelect"
  > & {
    actions: Actions;
    commands?: readonly Command[];
    model: ComponentProps<typeof NativeModelPicker>;
    access?: AgentComposerTools.Props["access"];
    modelLeading?: ReactNode;
    intents?: readonly AgentComposerTools.Intent[];
  };
}

const COMMAND_DESCRIPTIONS = {
  plan: "Plan before making changes",
  goal: "Work toward a goal with automatic continuation",
  side: "Show your latest side chat or open one; this chat is unchanged",
  stop: "Stop all background processes",
  compact: "Summarize earlier context while keeping the transcript",
  fork: "Create a separate chat from the latest committed message",
} satisfies Record<AgentComposer.CommandId, string>;

const IMMEDIATE_COMMANDS: ReadonlySet<AgentComposer.CommandId> = new Set([
  "plan",
  "goal",
  "side",
  "stop",
]);
