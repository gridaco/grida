/** Workspace whose saved chat rows the current Desktop page can act on. */
export function catalogWorkspaceId(url: Pick<URL, "pathname" | "search">) {
  if (url.pathname !== "/desktop/workspace") return null;
  const ids = new URLSearchParams(url.search).getAll("id");
  return ids.length === 1 && /^[a-f0-9]{16}$/.test(ids[0]) ? ids[0] : null;
}
