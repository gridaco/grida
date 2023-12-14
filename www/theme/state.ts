import { atom, selector } from "recoil";

export const themeState = atom<{
  mode: "system" | "light" | "dark";
  system: "pending" | "light" | "dark";
}>({
  key: "theme-state",
  default: {
    mode: "system", // 'default' | 'light' | 'dark'
    system: "pending", // 'pending' | 'light' | 'dark'
  },
});

export const selectTheme = selector<"system" | "light" | "dark">({
  key: "theme-selector",
  get: ({ get }) => {
    const { mode, system } = get(themeState);
    return (mode === "system" ? system : mode) as "system" | "light" | "dark";
  },
  set: ({ set }, newValue: "system" | "light" | "dark") => {
    set(themeState, prevState => ({ ...prevState, mode: newValue }));
  },
});

export const selectSystemTheme = selector<"pending" | "light" | "dark">({
  key: "system-theme-selector",
  get: ({ get }) => {
    const { system } = get(themeState);
    return system;
  },
  set: ({ set }, newValue: "pending" | "light" | "dark") => {
    set(themeState, prevState => ({ ...prevState, system: newValue }));
  },
});
