export function documentpreviewlink({
  orgid,
  projid,
  docid,
  path,
}: {
  orgid: number;
  projid: number;
  docid: string;
  path?: string;
}) {
  const baseurl = `/private/~/${orgid}/${projid}/preview/documents/${docid}/default`;
  if (path) {
    if (path.startsWith("/")) {
      path = path.substring(1);
    }
    return `${baseurl}/${path}`;
  }
  return baseurl;
}
