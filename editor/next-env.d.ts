/// <reference types="next" />
/// <reference types="next/types/global" />
declare module "*.txt" {
  const content: string;
  export default content;
}
