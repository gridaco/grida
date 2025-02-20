/**
 * forms /to-code/~ url
 */
export function formToCodeUrl(params: { design: string }): string {
  const _params = new URLSearchParams(params);
  return `/to-code/?${_params.toString()}`;
}
