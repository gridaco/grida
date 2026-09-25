import { catalog } from "@grida/ai-models/grida";
import type { DesktopAgentCapabilities } from "@grida/desktop-bridge";

/** Hosted UI must not offer a model that its installed runtime cannot run. */
export namespace desktop_text_catalog {
  export type Capability = DesktopAgentCapabilities["text_catalog_v2"];

  /** Missing capability is an old binary, not an optimistic current client. */
  export function view(textCatalogV2?: Capability): catalog.snapshot.View {
    return textCatalogV2 === true
      ? catalog.snapshot.v2.view()
      : catalog.snapshot.view();
  }

  export function defaultId(textCatalogV2?: Capability): string {
    return view(textCatalogV2).tier_model_ids.pro;
  }

  /** Recognize only the two untouched defaults when preload hydrates late. */
  export function isDefault(id: string): boolean {
    return id === defaultId() || id === defaultId(true);
  }
}
