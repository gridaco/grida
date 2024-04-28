export function editorlink(
  origin: string,
  form_id: string,
  page:
    | "blocks"
    | "settings"
    | "responses"
    | "connect"
    | "connect/store"
    | "connect/store/get-started"
    | "connect/store/products"
) {
  switch (page) {
    case "blocks":
      return `${origin}/d/${form_id}/blocks`;
    case "settings":
      return `${origin}/d/${form_id}/settings`;
    case "responses":
      return `${origin}/d/${form_id}/responses`;
    case "connect":
      return `${origin}/d/${form_id}/connect`;
    case "connect/store":
      return `${origin}/d/${form_id}/connect/store`;
    case "connect/store/get-started":
      return `${origin}/d/${form_id}/connect/store/get-started`;
    case "connect/store/products":
      return `${origin}/d/${form_id}/connect/store/products`;
  }
}

export function formlink(
  host: string,
  form_id: string,
  state?:
    | "complete"
    | "alreadyresponded"
    | "developererror"
    | "badrequest"
    | "formclosed"
    | "formsoldout"
    | "formoptionsoldout",
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
  state?:
    | "complete"
    | "alreadyresponded"
    | "developererror"
    | "badrequest"
    | "formclosed"
    | "formsoldout"
    | "formoptionsoldout"
) {
  if (state) return `${host}/d/e/${form_id}/${state}`;
  return `${host}/d/e/${form_id}`;
}
