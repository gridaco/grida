export namespace hotkey {
  export const keyboard_key_bindings = {
    r: "rectangle",
    t: "text",
    o: "ellipse",
    f: "container",
    a: "container",
    l: "line",
  } as const;

  export const keyboard_arrowy_key_vector_bindings = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
  } as const;

  export const keyboard_shift_translate_multiplier = 10;
}
