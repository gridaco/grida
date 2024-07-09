import { compile, serialize, stringify } from "stylis";

export namespace CustomCSS {
  /**
   *
   * converts nested scss to css
   *
   * @param css nested scss (stylis)
   * @returns
   */
  export function vanilla(css: string): string {
    return serialize(compile(css), stringify);
  }

  export const DATA_CUSTOM_CSS_KEY = "data-custom-css";
}
