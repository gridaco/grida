/** Native Settings categories and their browser-history/deep-link adapter. */
export namespace SettingsNavigation {
  export const sections = [
    { id: "account", label: "Account" },
    { id: "appearance", label: "Appearance" },
    { id: "chat", label: "Chat" },
    { id: "browser", label: "Browser" },
    { id: "credits", label: "Credits" },
    { id: "models", label: "LLM Providers" },
    { id: "media", label: "Media Providers" },
    { id: "hooks", label: "Hooks" },
    { id: "archived-chats", label: "Archived chats" },
    { id: "about", label: "About" },
  ] as const;
  export type Section = (typeof sections)[number]["id"];

  export function fromHash(hash: string): Section {
    const value = hash.replace(/^#/, "");
    if (value === "provider-elevenlabs" || value === "provider-tripo")
      return "media";
    return sections.find((section) => section.id === value)?.id ?? "account";
  }

  export const getSnapshot = (): Section =>
    typeof window === "undefined" ? "account" : fromHash(window.location.hash);
  export const getServerSnapshot = (): Section => "account";

  export function subscribe(listener: () => void): () => void {
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }

  export function select(value: string): void {
    const section = sections.find((section) => section.id === value);
    if (section) window.location.hash = section.id;
  }
}
