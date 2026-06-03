import { KeyCode, M, kb, match, type Keybinding } from "@grida/keybinding";

export const WORKSPACE_WORKBENCH_COMMAND_EVENT = "grida:workspace:command";

export const WORKSPACE_WORKBENCH_COMMANDS = [
  "workspace.tabs.close-active",
  "workspace.tabs.reopen-closed",
  "workspace.tabs.select-next",
  "workspace.tabs.select-previous",
] as const;

export type WorkspaceWorkbenchCommand =
  (typeof WORKSPACE_WORKBENCH_COMMANDS)[number];

type WorkspaceWorkbenchKeybinding = {
  command: WorkspaceWorkbenchCommand;
  keybinding: Keybinding;
};

export const WORKSPACE_WORKBENCH_KEYBINDINGS: readonly WorkspaceWorkbenchKeybinding[] =
  [
    {
      command: "workspace.tabs.close-active",
      keybinding: kb(KeyCode.KeyW, M.CtrlCmd),
    },
    {
      command: "workspace.tabs.reopen-closed",
      keybinding: kb(KeyCode.KeyT, M.CtrlCmd | M.Shift),
    },
    {
      command: "workspace.tabs.select-next",
      keybinding: kb(KeyCode.RightArrow, M.CtrlCmd | M.Alt),
    },
    {
      command: "workspace.tabs.select-previous",
      keybinding: kb(KeyCode.LeftArrow, M.CtrlCmd | M.Alt),
    },
  ];

export function matchWorkspaceWorkbenchKeybinding(
  event: KeyboardEvent
): WorkspaceWorkbenchCommand | null {
  for (const binding of WORKSPACE_WORKBENCH_KEYBINDINGS) {
    if (match(event, binding.keybinding)) return binding.command;
  }
  return null;
}

const WORKSPACE_WORKBENCH_COMMAND_SET = new Set<string>(
  WORKSPACE_WORKBENCH_COMMANDS
);

export function isWorkspaceWorkbenchCommand(
  value: unknown
): value is WorkspaceWorkbenchCommand {
  return (
    typeof value === "string" && WORKSPACE_WORKBENCH_COMMAND_SET.has(value)
  );
}
