/**
 * @deprecated dangerous - dev only
 * @param str
 * @param vars
 * @returns
 */
export function template(str: string, vars: Record<string, string>) {
  return str.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}
