export function setCache(key: string, value: string) {
  if (process.browser) {
    window.localStorage.setItem(_buildNonConflictingKey(key), value);
  }
}

export function loadCache(key: string): string | undefined {
  if (process.browser) {
    return window.localStorage.getItem(_buildNonConflictingKey(key));
  }
}

function _buildNonConflictingKey(ogkey: string): string {
  return "user-input-cache" + ogkey;
}
