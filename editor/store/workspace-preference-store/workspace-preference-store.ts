import { WorkspacePreferences } from "core/states";
export class WorkspacePreferenceStore {
  readonly key: string;
  constructor(ws?: string) {
    this.key = "workspace-preferences-" + ws ?? "default";
  }

  enable_preview_feature_components_support(b: boolean) {
    const pf = this.load();
    pf.enable_preview_feature_components_support = b;
    this.set(pf);
    return pf;
  }

  debug_mode(b: boolean) {
    const pf = this.load();
    pf.debug_mode = b;
    this.set(pf);
    return pf;
  }

  set(pf: WorkspacePreferences) {
    window.localStorage.setItem(this.key, JSON.stringify(pf));
  }

  load(): WorkspacePreferences {
    try {
      const pl = window.localStorage.getItem(this.key);
      if (!pl) {
        return;
      }
      return JSON.parse(pl) as WorkspacePreferences;
    } catch (e) {
      return;
    }
  }
}
