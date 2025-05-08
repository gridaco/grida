// types/mdx.d.ts
import type { JSX } from "react";
declare module "*.mdx" {
  let MDXComponent: (props) => JSX.Element;
  export default MDXComponent;
}
