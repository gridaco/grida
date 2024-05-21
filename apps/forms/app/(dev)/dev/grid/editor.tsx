"use client";

import { GridBlock, GridContext, GridEditor, useGrid } from "@/grid";
import {
  GridaBlock,
  GridaBlockRenderer,
  ObjectFit,
} from "@/app/(dev)/dev/grid/blocks";
import { InsertPanel } from "./panel";
import React, { useEffect, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { block_from_preset } from "./blocks/data";
import { Provider, useBuilderState } from "./core";
import { Textarea } from "@/components/ui/textarea";
import { nanoid } from "nanoid";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MediaPicker } from "@/scaffolds/mediapicker";
import { useFormPlaygroundMediaUploader } from "@/scaffolds/mediapicker/form-media-uploader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  TextAlignCenterIcon,
  TextAlignJustifyIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextAlignBottomIcon,
  TextAlignMiddleIcon,
  TextAlignTopIcon,
  ImageIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "@radix-ui/react-icons";
import { RgbaColorPicker } from "react-colorful";

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
            onInsert={(preset) => {
              const id = nanoid();

              const element = block_from_preset(preset);
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
  const [state, dispatch] = useBuilderState();
  const grid = useGrid();
  const [id, selection] = useSelection();
  return (
    <aside className="grow max-w-md border-s p-4">
      {id && (
        <>
          <h1 className="text-md font-mono mb-4">{id}</h1>
          <PropertyBody />
          <div>
            <Button
              onClick={() => {
                dispatch({ type: "block/delete", id });
                grid.deleteBlock(grid.selection!);
              }}
              variant="destructive"
            >
              Delete
            </Button>
            <div>
              <Button
                onClick={() => {
                  grid.translateBlockZ(grid.selection!, 1);
                }}
                variant="outline"
              >
                <ArrowUpIcon />
              </Button>
              <Button
                onClick={() => {
                  grid.translateBlockZ(grid.selection!, -1);
                }}
                variant="outline"
              >
                <ArrowDownIcon />
              </Button>
            </div>
          </div>
        </>
      )}
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
        <div className="flex flex-col gap-4">
          <div>
            <Label>Typography</Label>
            <Select>
              <SelectTrigger id="el" aria-label="Text Element">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="h1">
                  <h1>Heading 1</h1>
                </SelectItem>
                <SelectItem value="h2">
                  <h1>Heading 2</h1>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Horizontal</Label>
            <ToggleGroup type="single" id="horizontal">
              <ToggleGroupItem value="left">
                <TextAlignLeftIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="center">
                <TextAlignCenterIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="right">
                <TextAlignRightIcon />
              </ToggleGroupItem>
            </ToggleGroup>
            <Label>Vertical</Label>
            <ToggleGroup type="single" id="vertical">
              <ToggleGroupItem value="top">
                <TextAlignTopIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="middle">
                <TextAlignMiddleIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="bottom">
                <TextAlignBottomIcon />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div>
            <Label>Font</Label>
            <Select>
              <SelectTrigger id="font-family" aria-label="select font-family">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="h1">
                  <h1>Inter</h1>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Font Size</Label>
            <Input
              type="number"
              value={selection?.style?.fontSize}
              onChange={(e) => {
                dispatch({
                  type: "block/style",
                  id: id!,
                  style: {
                    fontSize: Number(e.target.value),
                  },
                });
              }}
            />
          </div>
          <div className="flex flex-col">
            <Label>Color</Label>
            <Popover>
              <PopoverTrigger>
                <div
                  className="w-full h-10 rounded-md border"
                  style={{
                    background: "red",
                  }}
                ></div>
              </PopoverTrigger>
              <PopoverContent>
                <RgbaColorPicker />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col">
            <Label>Background</Label>
            <Popover>
              <PopoverTrigger>
                <div
                  className="w-full h-10 rounded-md border"
                  style={{
                    background: "blue",
                  }}
                ></div>
              </PopoverTrigger>
              <PopoverContent>
                <RgbaColorPicker />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label htmlFor="data">Text</Label>
            <Textarea
              id="data"
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
        </div>
      );
    }
    case "image": {
      return (
        <div>
          <Button
            variant="outline"
            onClick={() => {
              setMediaPickerOpen(true);
            }}
          >
            <ImageIcon />
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
          <Select
            value={selection?.style?.objectFit}
            onValueChange={(objectFit) => {
              dispatch({
                type: "block/style",
                id: id!,
                style: {
                  objectFit: objectFit as ObjectFit,
                },
              });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cover">Fill</SelectItem>
              <SelectItem value="contain">Fit</SelectItem>
            </SelectContent>
          </Select>
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
