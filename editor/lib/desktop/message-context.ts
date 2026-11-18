const XML_ATTRIBUTE_ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export function xmlAttribute(name: string, value: string | number): string {
  return `${name}="${String(value).replace(
    /[&<>"']/g,
    (character) => XML_ATTRIBUTE_ENTITIES[character]
  )}"`;
}
