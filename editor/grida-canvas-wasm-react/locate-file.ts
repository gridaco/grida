/**
 * Locate the wasm file in the correct location.
 * @returns The URL of the file.
 */
export default function locateFile(path: string) {
  if (process.env.NEXT_PUBLIC_GRIDA_WASM_SERVE_URL) {
    return `${process.env.NEXT_PUBLIC_GRIDA_WASM_SERVE_URL}/${path}`;
  } else if (process.env.NODE_ENV === "development") {
    return `http://localhost:4020/dist/${path}`;
  } else {
    return `https://unpkg.com/@grida/canvas-wasm@latest/dist/${path}`;
  }
}
