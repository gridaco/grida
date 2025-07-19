import type { TemplateComponent } from "@/grida-canvas-react-renderer-dom/template-builder/with-template";

export namespace TemplateComponents {
  export const components: { [key: string]: TemplateComponent } = {};

  export function registerComponent(component: TemplateComponent) {
    components[component.type!] = component;
  }
}
