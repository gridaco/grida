export function formlink(
  host: string,
  form_id: string,
  state?: "complete" | "alreadyresponded" | "formclosed",
  params?: { [key: string]: string | number | undefined }
) {
  const q = params ? new URLSearchParams(params as any).toString() : null;
  let url = _form_state_link(host, form_id, state);
  if (q) url += `?${q}`;
  return url;
}

function _form_state_link(
  host: string,
  form_id: string,
  state?: "complete" | "alreadyresponded" | "formclosed"
) {
  if (state) return `${host}/d/e/${form_id}/${state}`;
  return `${host}/d/e/${form_id}`;
}
