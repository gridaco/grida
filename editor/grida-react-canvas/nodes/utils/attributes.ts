import type grida from "@grida/schema";

/**
 * safely maps the attributes that are required to be passed to the html element
 * @param props
 * @returns
 */
export default function queryattributes<
  P extends grida.program.document.INodeHtmlDocumentQueryDataAttributes,
>(props: P): grida.program.document.INodeHtmlDocumentQueryDataAttributes {
  return {
    id: props.id,
    "data-grida-node-id": props["data-grida-node-id"],
    "data-grida-node-locked": props["data-grida-node-locked"],
    "data-grida-node-type": props["data-grida-node-type"],
    "data-dev-editor-hovered": props["data-dev-editor-hovered"],
    "data-dev-editor-selected": props["data-dev-editor-selected"],
  } satisfies grida.program.document.INodeHtmlDocumentQueryDataAttributes;
}
