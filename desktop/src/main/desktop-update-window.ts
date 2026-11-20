import { BrowserWindow } from "electron";
import gridaSymbol from "../../../editor/public/brand/grida-symbol-240-dark.svg?raw";
import updatePage from "./desktop-update-page.html?raw";

const actionLabels = {
  retry: "Retry",
  download: "Download installer",
  restart: "Restart to update",
} as const;

function actionUrl(action: DesktopUpdateWindow.Action): string {
  return `https://desktop-update.invalid/${action}`;
}

function actionLink(action: DesktopUpdateWindow.Action): string {
  return `<a href="${actionUrl(action)}" data-action="${action}">${actionLabels[action]}</a>`;
}

function escapeText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** A local status window whose only actions are interpreted by Main. */
export class DesktopUpdateWindow {
  #window: BrowserWindow | undefined;
  #document:
    | { source: string; actions: readonly DesktopUpdateWindow.Action[] }
    | undefined;

  constructor(
    private readonly onAction: (action: DesktopUpdateWindow.Action) => void,
    private readonly onClose: () => void
  ) {}

  async show(view: DesktopUpdateWindow.View): Promise<void> {
    const actions = [...(view.actions ?? [])];
    const [primary, ...alternatives] = actions;
    const installerInFooter =
      primary === "restart" && alternatives.includes("download");
    const secondary = installerInFooter
      ? alternatives.filter((action) => action !== "download")
      : alternatives;
    const detail = [
      view.detail && escapeText(view.detail),
      installerInFooter && actionLink("download"),
    ]
      .filter(Boolean)
      .join(" · ");
    const actionMarkup = primary
      ? `<nav class="actions" aria-label="Update options">${actionLink(primary)}${
          secondary.length
            ? `<div class="secondary-actions">${secondary.map(actionLink).join("")}</div>`
            : ""
        }</nav>`
      : "";
    const footer =
      actionMarkup + (detail ? `<div class="detail">${detail}</div>` : "");
    const slots = {
      symbol: gridaSymbol,
      title: escapeText(view.title),
      message: view.message ? `<p>${escapeText(view.message)}</p>` : "",
      footer: footer ? `<footer class="footer">${footer}</footer>` : "",
    };
    const html = updatePage.replace(
      /\{\{(symbol|title|message|footer)\}\}/g,
      (_match, slot: keyof typeof slots) => slots[slot]
    );
    const source = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    const window = this.#window ?? this.#create();
    const document = { source, actions };
    this.#document = document;

    try {
      await window.loadURL(source);
    } catch (error) {
      // A new presentation or dismissal cancels the previous navigation.
      if (this.#window !== window || this.#document !== document) return;
      this.close();
      throw error;
    }
    if (this.#window === window && this.#document === document) window.show();
  }

  close(): void {
    const window = this.#window;
    this.#window = undefined;
    this.#document = undefined;
    if (window && !window.isDestroyed()) window.destroy();
  }

  focus(): void {
    if (this.#window?.isVisible()) this.#window.focus();
  }

  #create(): BrowserWindow {
    const window = new BrowserWindow({
      title: "Grida Desktop Updates",
      width: 350,
      height: 525,
      backgroundColor: "#000000",
      titleBarStyle: "hidden",
      titleBarOverlay:
        process.platform === "darwin"
          ? undefined
          : { color: "#000000", symbolColor: "#c4c4c4", height: 36 },
      useContentSize: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        partition: "grida-desktop-update",
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: false,
        devTools: false,
        navigateOnDragDrop: false,
      },
    });
    this.#window = window;
    window.removeMenu();
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-frame-navigate", (event) => {
      event.preventDefault();
      const document = this.#document;
      if (
        this.#window !== window ||
        !event.isMainFrame ||
        !document ||
        window.webContents.getURL() !== document.source
      ) {
        return;
      }
      const action = document.actions.find(
        (action) => actionUrl(action) === event.url
      );
      if (action) this.onAction(action);
    });
    window.once("closed", () => {
      if (this.#window !== window) return;
      this.#window = undefined;
      this.#document = undefined;
      this.onClose();
    });
    return window;
  }
}

export namespace DesktopUpdateWindow {
  export type Action = keyof typeof actionLabels;
  export type View = {
    title: string;
    message?: string;
    detail?: string;
    actions?: readonly Action[];
  };
}
