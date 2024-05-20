"use client";

import { GridBlock, GridContext, GridEditor, useGrid } from "@/grid";
import { GridaBlock, GridaBlockRenderer } from "@/app/(dev)/dev/grid/blocks";
import { InsertPanel } from "./panel";
import React, { useEffect, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { create_initial_grida_block } from "./blocks/data";
import { Provider, useBuilderState } from "./core";
import { Textarea } from "@/components/ui/textarea";
import { nanoid } from "nanoid";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MediaPicker } from "@/scaffolds/mediapicker";
import { useFormPlaygroundMediaUploader } from "@/scaffolds/mediapicker/form-media-uploader";

export function PageBuilder() {
  return (
    <Provider>
      <GridContext>
        <App />
      </GridContext>
    </Provider>
  );
}

function App() {
  const [state, dispatch] = useBuilderState();

  return (
    <div className="w-full h-full flex">
      <>
        <Controls />
      </>
      <div className="grow prose mx-auto flex items-center justify-center">
        <GridEditor
          renderer={({ id }) => {
            const block = state.blocks[id];
            return <GridaBlockRenderer {...block} />;
          }}
          onMarqueeEnd={() => {
            dispatch({ type: "ui/insert-panel/open", open: true });
          }}
          onBlockDoubleClick={(block) => {
            //
          }}
        />
      </div>
      <Properties />
    </div>
  );
}

function Controls() {
  const grid = useGrid();

  const [state, dispatch] = useBuilderState();

  return (
    <>
      <Popover
        defaultOpen={false}
        open={state.is_insert_panel_open}
        onOpenChange={(open) => {
          dispatch({ type: "ui/insert-panel/open", open });
        }}
      >
        <PopoverTrigger className="absolute top-0 left-0 w-40 h40 bg-red-900 z-10">
          <div />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          sideOffset={100}
          alignOffset={100}
        >
          <InsertPanel
            onInsert={(type) => {
              const id = nanoid();

              const element = create_initial_grida_block(type);
              if (!element) return;

              dispatch({
                type: "block/insert",
                id,
                data: element,
              });

              // insert the grid block with the reference
              grid.insertBlockOnAera({
                $schema: "https://griad.co/schema/ref.json",
                id: id,
              });

              // hide the panel
              dispatch({ type: "ui/insert-panel/open", open: false });
            }}
          />
        </PopoverContent>
      </Popover>
    </>
  );
}

type BlockRef = {
  $schema: "https://griad.co/schema/ref.json";
  id: string;
};

function useSelection() {
  const [state] = useBuilderState();
  const [id, setId] = useState<string>();
  const [selection, setSelection] = useState<GridaBlock>();

  const grid = useGrid();

  useEffect(() => {
    const _: GridBlock<BlockRef> | undefined = grid.blocks.find(
      (block) => block.id === grid.selection
    );
    if (_) {
      const id = _.data?.id;
      if (!id) return;

      const block = state.blocks[id];

      setId(id);
      setSelection(block);
      return;
    }

    setId(undefined);
    setSelection(undefined);
  }, [grid.selection, grid.blocks, state.blocks]);

  return [id, selection] as const;
}

function Properties() {
  const [id, selection] = useSelection();
  return (
    <aside className="grow max-w-md border-s p-4">
      <h1 className="text-md font-mono mb-4">{id}</h1>
      <PropertyBody />
    </aside>
  );
}

function PropertyBody() {
  const [state, dispatch] = useBuilderState();
  const [id, selection] = useSelection();
  const playgroundUploader = useFormPlaygroundMediaUploader();
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);

  switch (selection?.type) {
    case "typography": {
      return (
        <div>
          <Label>Text</Label>
          <Textarea
            value={selection?.data}
            onChange={(e) => {
              dispatch({
                type: "block/text/data",
                id: id!,
                data: e.target.value,
              });
            }}
            placeholder="Type something"
          />
        </div>
      );
    }
    case "image": {
      return (
        <div>
          <Button
            onClick={() => {
              setMediaPickerOpen(true);
            }}
          >
            Upload Image
          </Button>
          <MediaPicker
            open={mediaPickerOpen}
            onOpenChange={(open) => {
              setMediaPickerOpen(open);
            }}
            uploader={playgroundUploader}
            onUseImage={(src) => {
              dispatch({
                type: "block/media/src",
                id: id!,
                src,
              });
            }}
          />
        </div>
      );
    }
    case "video": {
      return (
        <div>
          <Label>Link</Label>
          <Input
            value={selection?.src}
            onChange={(e) => {
              dispatch({
                type: "block/media/src",
                id: id!,
                src: e.target.value,
              });
            }}
          />
        </div>
      );
    }
    case "button": {
      return (
        <div>
          <div>
            <Label>Label</Label>
            <Input value={selection?.label} />
          </div>
          <div>
            <Label>Link</Label>
            <Input value={selection?.href} />
          </div>
        </div>
      );
    }
    default: {
      return <div />;
    }
  }
}
