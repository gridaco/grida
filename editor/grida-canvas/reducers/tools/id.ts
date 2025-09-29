import { v4 } from "uuid";

let i = 0;

/**
 * Node ID generator
 * @deprecated use editor.id() instead
 * @returns
 */
export default function nid() {
  // if (process.env.NODE_ENV === "development") {
  //   return "dev-" + i++;
  // }
  return v4();
}
