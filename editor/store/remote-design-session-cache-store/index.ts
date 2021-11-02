import { RawNodeResponse } from "@design-sdk/figma-remote";
import { parseFileAndNodeId } from "@design-sdk/figma-url";

/**
 * Session cache for remote design. it works based on target url.
 */
export class RemoteDesignSessionCacheStore {
  readonly config: {
    file: string;
    node: string;
  };

  constructor(props: { url: string } | { file: string; node: string }) {
    if ("url" in props) {
      this.config = parseFileAndNodeId(props.url);
    } else {
      this.config = props;
    }
  }

  set(raw: RawNodeResponse) {
    window.sessionStorage.setItem(this.key, JSON.stringify(raw));
  }

  get(): null | RawNodeResponse {
    const payload = window.sessionStorage.getItem(this.key);
    return payload ? JSON.parse(payload) : null;
  }

  clear() {
    window.sessionStorage.removeItem(this.key);
  }

  get exists(): boolean {
    return !!window.sessionStorage.getItem(this.key);
  }

  private get key() {
    return `remote-design-session-cache-${
      this.config.file + "-" + this.config.node
    }`;
  }
}
