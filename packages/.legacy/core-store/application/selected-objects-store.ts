import { keys } from "./_keys";
const _key = keys["selected-objects"];
export function getSelectedObjects(): string[] | undefined {
  return JSON.parse(window.localStorage.getItem(_key) ?? "[]") as string[];
}

export function setSelectedObjects(objects: string[]) {
  const d = JSON.stringify(objects);
  window.localStorage.setItem(_key, d);
}
