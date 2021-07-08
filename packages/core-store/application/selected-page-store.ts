import { keys } from "./_keys";
const _key = keys["selected-page"];
export function getSelectedPage(): string | undefined {
  return window.localStorage.getItem(_key);
}

export function setSelectedPage(page: string) {
  window.localStorage.setItem(_key, page);
}
