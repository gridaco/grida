import { compile, serialize, stringify } from "stylis";

export namespace CustomCSS {
  /**
   *
   * converts nested scss to css
   *
   * @param css nested scss (stylis)
   * @param scope wrapper class .<scope>
   * @returns
   */
  export function vanilla(css: string, scope?: string): string {
    if (scope) {
      css = `.${scope} { ${css} }`;
    }
    css = serialize(compile(css), stringify);
    return css;
  }

  export const DATA_CUSTOM_CSS_KEY = "data-custom-css";
}
