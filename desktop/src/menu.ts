import {
  App,
  Shell,
  BrowserWindow,
  MenuItemConstructorOptions,
  Menu,
  MenuItem,
  dialog,
} from "electron";
import create_window from "./window";

/**
 * Recursively merges two menu templates.
 * For items with the same label, properties from the later template override those in the earlier one.
 * If both items have submenus (arrays), they are merged recursively.
 *
 * This helper merges two arrays.
 */
function merge_two_templates(
  a: MenuItemConstructorOptions[],
  b: MenuItemConstructorOptions[]
): MenuItemConstructorOptions[] {
  const merged = [...a];
  b.forEach((customItem) => {
    // Try to find a matching default item by label.
    const idx = merged.findIndex(
      (defaultItem) => defaultItem.label === customItem.label
    );
    if (idx !== -1) {
      // Found an item with the same label, merge properties.
      const defaultItem = merged[idx];
      const mergedItem: MenuItemConstructorOptions = {
        ...defaultItem,
        ...customItem,
      };

      // If both have submenus, merge them recursively.
      if (
        Array.isArray(defaultItem.submenu) &&
        Array.isArray(customItem.submenu)
      ) {
        mergedItem.submenu = merge_templates(
          defaultItem.submenu as MenuItemConstructorOptions[],
          customItem.submenu as MenuItemConstructorOptions[]
        );
      }
      merged[idx] = mergedItem;
    } else {
      // Not found in default, so add the custom item.
      merged.push(customItem);
    }
  });
  return merged;
}

/**
 * Recursively merges multiple menu templates.
 *
 * @param templates - A rest parameter of menu template arrays.
 * @returns The merged menu template.
 */
export function merge_templates(
  ...templates: MenuItemConstructorOptions[][]
): MenuItemConstructorOptions[] {
  if (templates.length === 0) return [];
  // Start with the first template.
  let merged = templates[0];
  // Merge each subsequent template into the merged result.
  for (let i = 1; i < templates.length; i++) {
    merged = merge_two_templates(merged, templates[i]);
  }
  return merged;
}

export function create_default_menu(
  app: App,
  shell: Shell
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo", accelerator: "CmdOrCtrl+Z" },
        { role: "redo", accelerator: "Shift+CmdOrCtrl+Z" },
        { type: "separator" },
        { role: "cut", accelerator: "CmdOrCtrl+X" },
        { role: "copy", accelerator: "CmdOrCtrl+C" },
        { role: "paste", accelerator: "CmdOrCtrl+V" },
        { role: "selectAll", accelerator: "CmdOrCtrl+A" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click: (menuItem: MenuItem, focusedWindow?: BrowserWindow) => {
            if (focusedWindow) focusedWindow.reload();
          },
        },
        {
          label: "Toggle Full Screen",
          accelerator: process.platform === "darwin" ? "Ctrl+Command+F" : "F11",
          click: (menuItem: MenuItem, focusedWindow?: BrowserWindow) => {
            if (focusedWindow)
              focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
          },
        },
      ],
    },
    {
      label: "Window",
      role: "window",
      submenu: [
        { role: "minimize", accelerator: "CmdOrCtrl+M" },
        { role: "close", accelerator: "CmdOrCtrl+W" },
      ],
    },
    {
      label: "Help",
      role: "help",
      submenu: [
        {
          label: "Slack Community",
          click: () => shell.openExternal("https://grida.co/join-slack"),
        },
        {
          label: "Open an Issue",
          click: () =>
            shell.openExternal("http://github.com/gridaco/grida/issues"),
        },
        {
          label: "Discussions",
          click: () =>
            shell.openExternal("https://github.com/orgs/gridaco/discussions"),
        },
      ],
    },
  ];

  // macOS specific adjustments
  if (process.platform === "darwin") {
    const appName: string = app.name || "Application";
    template.unshift({
      label: appName,
      submenu: [
        { role: "about", label: "About " + appName },
        { type: "separator" },
        { role: "services", label: "Services", submenu: [] },
        { type: "separator" },
        {
          role: "hide",
          label: "Hide " + appName,
          accelerator: "Command+H",
        },
        {
          role: "unhide",
          label: "Show All",
        },
        { type: "separator" },
        {
          role: "quit",
          label: "Quit " + appName,
          accelerator: "Command+Q",
          click: () => app.quit(),
        },
      ],
    });

    // Add "Bring All to Front" to the Window menu
    const windowMenu = template.find((m) => m.role === "window") as
      | MenuItemConstructorOptions
      | undefined;
    if (windowMenu && Array.isArray(windowMenu.submenu)) {
      (windowMenu.submenu as MenuItemConstructorOptions[]).push(
        { type: "separator" },
        { role: "front", label: "Bring All to Front" }
      );
    }
  }

  return template;
}

export default function create_menu(app: App, shell: Shell) {
  const default_menu = create_default_menu(app, shell);
  const doctype_canvas_menus: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "New File",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            // TODO:
            console.log("New File clicked");
          },
        },
        {
          label: "New Window",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => {
            create_window();
          },
        },
        { type: "separator" },
        {
          label: "Open...",
          accelerator: "CmdOrCtrl+O",
          click: () => {
            // TODO:
            dialog.showOpenDialog({
              properties: ["openFile"],
              filters: [{ name: "Grida Files", extensions: ["grida"] }],
            });
          },
        },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => {
            // TODO:
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send("app:save");
            }
          },
        },
        {
          label: "Save As...",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => {
            // TODO:
            dialog.showSaveDialog({
              filters: [{ name: "Grida Files", extensions: ["grida"] }],
            });
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(
    merge_templates(default_menu, doctype_canvas_menus)
  );
}
