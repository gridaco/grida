import {
  BlockNoteSchema,
  defaultBlockSpecs,
  PartialBlock,
} from "@blocknote/core";
const { table: _noop1, ...remainingSpecs } = defaultBlockSpecs;

/**
 * RichText schema without table block
 */
export const schema = BlockNoteSchema.create({
  blockSpecs: remainingSpecs,
});

/**
 * BlockNote throws error if non bn json is passed to initialContent
 * @param value
 * @returns
 */
export function safeInitialContent(value: unknown) {
  if (Array.isArray(value) && value.length > 0) {
    return value;
  }
  return undefined;
}
