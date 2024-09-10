"use client";

import {
  DotsHorizontalIcon,
  ReaderIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { EditorFlatFormBlock } from "@/scaffolds/editor/state";
import {
  BlockHeader,
  FlatBlockBase,
  useBlockFocus,
  useDeleteBlock,
} from "./base-block";
import { useEditorState } from "@/scaffolds/editor";
import { PDFViewer } from "@/components/pdf-viewer";
import { Input } from "@/components/ui/input";

export function PdfBlock({
  id,
  type,
  form_field_id,
  src,
  data,
}: EditorFlatFormBlock) {
  const [state, dispatch] = useEditorState();
  const [focused, setFocus] = useBlockFocus(id);

  const deleteBlock = useDeleteBlock();

  return (
    <FlatBlockBase focused={focused} onPointerDown={setFocus} invalid={!src}>
      <BlockHeader>
        <div className="flex flex-col gap-2">
          <div className="flex flex-row items-center gap-8">
            <span className="flex flex-row gap-2 items-center">
              <ReaderIcon />
              PDF
            </span>
          </div>
          <p className="text-xs opacity-50">Embed pdf from URL.</p>
        </div>
        <div>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <DotsHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => deleteBlock(id)}>
                <TrashIcon className="me-2 align-middle" />
                Delete Block
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </BlockHeader>
      <div>
        <div className="py-4">
          <Input
            type="text"
            value={src ?? ""}
            onChange={(e) => {
              // TODO:
              dispatch({
                type: "blocks/video/src",
                block_id: id,
                src: e.target.value,
              });
            }}
            placeholder="Video URL"
          />
        </div>
        <div className="bg-neutral-200 rounded overflow-hidden border border-black/20 aspect-video">
          <PDFViewer file={src ?? ""} />
        </div>
      </div>
    </FlatBlockBase>
  );
}
