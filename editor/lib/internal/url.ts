type Params = {
  /**
   * organization.id or organization.name
   */
  org: string | number;

  /**
   * project.id or project.name
   */
  proj: string | number;

  /**
   * tenant site path
   */
  path?: string[] | string;
};

/**
 * Convert path tokens to a relative path
 *
 * @example
 * ```ts
 * relpath(["a", "b", "c"]) // "a/b/c"
 * relpath("a/b/c") // "a/b/c"
 * relpath(["/a", "b", "c"]) // "a/b/c"
 * relpath("/a/b/c") // "a/b/c"
 * ```
 */
function relpath(path_tokens: string | string[] = "") {
  let path = "";
  if (Array.isArray(path_tokens)) {
    path = path_tokens.join("/");
  } else {
    path = typeof path_tokens === "string" ? path_tokens : "";
  }
  if (path.startsWith("/")) {
    path = path.substring(1);
  }
  return path;
}

export function previewlink({ org, proj, path }: Params) {
  const baseurl = `/private/~/${org}/${proj}/preview`;
  return `${baseurl}/${relpath(path)}`;
}

export function documentpreviewlink({
  org,
  proj,
  docid,
  path,
}: Params & {
  docid: string;
}) {
  const baseurl = `/private/~/${org}/${proj}/preview/documents/${docid}/default`;
  return `${baseurl}/${relpath(path)}`;
}
