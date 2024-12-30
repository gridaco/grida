import "./types";
export namespace Chatwoot {
  export function toggle(state?: "open" | "close") {
    window.$chatwoot.toggle(state);
  }

  export function reset() {
    window.$chatwoot.reset();
  }

  export function setLabel(label: string) {
    window.$chatwoot.setLabel(label);
  }

  export function removeLabel(label: string) {
    window.$chatwoot.removeLabel(label);
  }
}
