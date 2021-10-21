import { RawNodeResponse } from "@design-sdk/figma-remote";

/**
 * Session cache for remote design. it works based on target url.
 */
export class RemoteDesignSessionCacheStore {
  readonly url: string;
  constructor({ url }: { url: string }) {
    this.url = url;
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
    return `remote-design-session-cache-${this.url}`;
  }
}
