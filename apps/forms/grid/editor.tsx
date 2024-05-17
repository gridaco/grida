"use client";
import { produce } from "immer";
import {
  ButtonIcon,
  ImageIcon,
  Link2Icon,
  PlusIcon,
  TextIcon,
  VideoIcon,
} from "@radix-ui/react-icons";
import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { useGesture } from "@use-gesture/react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import { useDraggable } from "@dnd-kit/core";
const ReactPlayer = dynamic(() => import("react-player/lazy"), { ssr: false });

const blockpresets = [
  {
    type: "forms.grida.co/start-form-button",
    label: "Start Button",
    icon: <ButtonIcon />,
  },
  {
    type: "button",
    label: "Button",
    icon: <ButtonIcon />,
  },
  {
    type: "text",
    label: "Text",
    icon: <TextIcon />,
  },
  {
    type: "link",
    label: "Link",
    icon: <Link2Icon />,
  },
  {
    type: "image",
    label: "Image",
    icon: <ImageIcon />,
  },
  {
    type: "video",
    label: "Video",
    icon: <VideoIcon />,
  },
  {
    type: "youtue",
    label: "YouTube",
    icon: <VideoIcon />,
  },
] as const;

type GridaBlock =
  | GridaGridImageBlock
  | GridaGridTypographyBlock
  | GridaGridButtonBlock
  | GridaGridVideoBlock;

type GridaBlockType = GridaBlock["type"];

type GridaGridImageBlock = {
  type: "image";
  src: string;
};

type GridaGridTypographyBlock = {
  type: "typography";
  element: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span";
  data: string;
};

type GridaGridButtonBlock = {
  type: "button";
  label: string;
  href?: string;
};

type GridaGridVideoBlock = {
  type: "video";
  src: string;
};

type Area = [number, number, number, number];
type Position = [number, number];
type Size = [number, number];
type BlockId = string;

type Block<T = any> = {
  id: BlockId;
  x: Position;
  y: Position;
  z?: number;
  element?: T;
};

interface State {
  /**
   * scale factor for grid
   * @default 1
   */
  scalefactor: number;

  /**
   * actual width - consider canvas width
   * @default 375
   */
  width: number;

  /**
   * actual height - consider canvas height
   * @default 750
   */
  height: number;

  /**
   * grid size
   * @default [6, 12]
   */
  size: Size;
  /**
   * current pointer position in grid space
   */
  pos: Position;

  /**
   * is dragging
   */
  dragging: boolean;

  /**
   * start position of marquee in grid space
   */
  start?: Position;

  /**
   * end position of marquee in grid space
   */
  end?: Position;

  /**
   * marquee area in grid space
   */
  marquee?: Area;

  controls: {
    insert_panel_open: boolean;
  };

  /**
   * selected block id
   */
  selected?: BlockId;

  debug?: boolean;

  /**
   * grid content blocks
   */
  blocks: Block[];
}

const initial: State = {
  scalefactor: 1,
  width: 375,
  height: 750,
  size: [6, 12],
  pos: [0, 0],
  dragging: false,
  selected: undefined,
  marquee: undefined,
  controls: {
    insert_panel_open: false,
  },
  blocks: [],
};

type Action =
  | CellPonterMoveAction
  | CellPonterDownrAction
  | OpenChangeInsertBlockPanel
  | CellPonterUpAction
  | InsertBlock;

interface CellPonterMoveAction {
  type: "pointermove";
  pos: [number, number];
}

interface CellPonterDownrAction {
  type: "pointerdown";
}

interface CellPonterUpAction {
  type: "pointerup";
}

interface OpenChangeInsertBlockPanel {
  type: "controls/insert_panel_open";
  open: boolean;
}

interface InsertBlock<T = any> {
  type: "blocks/new";
  block: T;
}

const Context = React.createContext<State | undefined>(undefined);

type Dispatcher = (action: Action) => void;
type FlatDispatcher = (action: Action) => void;
const __noop = () => {};

const DispatchContext = createContext<Dispatcher>(__noop);

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "pointerdown": {
      return produce(state, (draft) => {
        draft.dragging = true;
        draft.start = state.pos;
        draft.marquee = [...state.pos, ...state.pos];
      });
    }
    case "pointerup": {
      return produce(state, (draft) => {
        draft.dragging = false;
        draft.end = state.pos;

        // open insert panel
        draft.controls.insert_panel_open = true;
      });
    }
    case "pointermove": {
      const { pos } = action;
      return produce(state, (draft) => {
        draft.pos = pos;

        if (state.dragging && state.start) {
          const [startX, startY] = state.start;
          const [endX, endY] = pos;

          const [minX, maxX] = startX < endX ? [startX, endX] : [endX, startX];
          const [minY, maxY] = startY < endY ? [startY, endY] : [endY, startY];

          draft.end = pos;
          draft.marquee = [minX, minY, maxX, maxY];
        }
      });
    }
    case "controls/insert_panel_open": {
      return produce(state, (draft) => {
        draft.controls.insert_panel_open = action.open;
      });
    }
    case "blocks/new": {
      return produce(state, (draft) => {
        const id = nanoid();
        const [_mx1, _my1, _mx2, _my2] = state.marquee ?? [0, 0, 1, 1];

        const x: Position = [_mx1 + 1, _mx2 + 2]; // +1 to endX for exclusive end in grid-area
        const y: Position = [_my1 + 1, _my2 + 2]; // +1 to endY for exclusive end in grid-area

        const el = create_initial_grida_block(action.block);
        draft.blocks.push({
          id,
          x: x,
          y: y,
          z: 0,
          element: el,
        });

        // close insert panel
        draft.controls.insert_panel_open = false;
      });
    }
  }
  return produce(state, (draft) => {});
}

function create_initial_grida_block(block: GridaBlockType): GridaBlock {
  switch (block) {
    case "button": {
      return {
        type: "button",
        label: "Button",
      };
    }
    case "typography": {
      return {
        type: "typography",
        element: "h1",
        data: "Hello World",
      };
    }
    // case 'link': {
    //   return {
    //     type: 'link',
    //     label: 'Link'
    //   }
    // }
    case "image": {
      return {
        type: "image",
        src: "https://placehold.co/600x400",
      };
    }
    case "video": {
      return {
        type: "video",
        src: "",
      };
    }
    // case 'youtube': {
    //   return {
    //     type: 'youtube',
    //     src: ''
    //   }
    // }
  }
}

export const useDispatch = (): FlatDispatcher => {
  const dispatch = useContext(DispatchContext);
  return useCallback(
    (action: Action) => {
      dispatch(action);
    },
    [dispatch]
  );
};

export const StateProvider = memo(function StateProvider({
  state,
  dispatch,
  children,
}: {
  state: State;
  dispatch?: Dispatcher;
  children?: React.ReactNode;
}) {
  return (
    <Context.Provider value={state}>
      <DispatchContext.Provider value={dispatch ?? __noop}>
        {children}
      </DispatchContext.Provider>
    </Context.Provider>
  );
});

const useGrid = (): [State, FlatDispatcher] => {
  const state = useContext(Context);

  if (!state) {
    throw new Error(`No StateProvider: this is a logical error.`);
  }

  const dispatch = useDispatch();

  return useMemo(() => [state, dispatch], [state, dispatch]);
};

function Provider({ children }: React.PropsWithChildren<{}>) {
  const [state, dispatch] = React.useReducer(reducer, initial);
  return (
    <StateProvider state={state} dispatch={dispatch}>
      {children}
    </StateProvider>
  );
}

export default function Editor() {
  return (
    <Provider>
      <GridEditor />
    </Provider>
  );
}

function GridEditor() {
  const [state, dispatch] = useGrid();
  return (
    <div className="relative w-full h-full">
      <Drawer
        open={state.controls.insert_panel_open}
        onOpenChange={(open) => {
          dispatch({ type: "controls/insert_panel_open", open: open });
        }}
      >
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Insert Block</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 flex flex-col gap-2 w-full">
            {blockpresets.map((block) => (
              <Button
                variant="outline"
                className="h-20"
                key={block.type}
                onClick={() => {
                  switch (block.type) {
                    case "text": {
                      dispatch({
                        type: "blocks/new",
                        block: "typography",
                      });
                      return;
                    }
                  }
                  dispatch({
                    type: "blocks/new",
                    // @ts-ignore TODO: handle presets
                    block: block.type,
                  });
                }}
              >
                {React.cloneElement(block.icon, {
                  className: "w-6 h-6 mr-2",
                })}
                {block.label}
              </Button>
            ))}
          </div>
          <DrawerFooter>
            <Button>OK</Button>
            <DrawerClose>
              <Button variant="outline">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      <GridGuide col={6} row={12} />
      <Grid col={6} row={12}>
        {state.blocks.map((block) => (
          <GridAreaBlock
            key={block.id}
            id={block.id}
            x={block.x}
            y={block.y}
            z={block.z}
          >
            {GridaBlockRenderer(block.element)}
          </GridAreaBlock>
        ))}
      </Grid>
    </div>
  );
}

function GridaBlockRenderer(block: GridaBlock) {
  const { type } = block;
  switch (type) {
    case "image":
      const { src } = block as GridaGridImageBlock;
      return <ImageBlock src={src} />;
    case "typography":
      const { element, data } = block as GridaGridTypographyBlock;
      return React.createElement(element, {}, data);
    case "button":
      const { label } = block as GridaGridButtonBlock;
      return <Button>{label}</Button>;
    // case 'video'
  }
}

const gridpos = (col: number, row: number, i: number): Position => {
  const x = i % col;
  const y = Math.floor(i / col);
  return [x, y];
};

function GridGuide({
  col,
  row,
  debug,
}: {
  col: number;
  row: number;
  debug?: boolean;
}) {
  // <div
  //   style={{
  //     height: "852px",
  //     width: "calc(100% - 1px)",
  //     boxSizing: "border-box",
  //     pointerEvents: "none",
  //     position: "absolute",
  //     top: 0,
  //     left: 0,
  //     zIndex: -10,
  //     mixBlendMode: "difference",
  //     backgroundImage:
  //       "linear-gradient(rgba(255, 255, 255, 0.65) 0.51px, transparent 0.51px), linear-gradient(to right, rgba(255, 255, 255, 0.65) 0.51px, transparent 0.51px)",
  //     backgroundPosition: "-1px -1px",
  //     backgroundSize: "71px 71px",
  //   }}
  // ></div>

  const [state, dispatch] = useGrid();

  return (
    <>
      <div
        className="w-full h-full z-10"
        style={{
          position: "absolute",
          display: "grid",
          gridTemplateColumns: `repeat(${col}, 1fr)`,
          gridTemplateRows: `repeat(${row}, 1fr)`,
          // height: "calc(var(--scale-factor) * 750)",
          // width: "calc(var(--scale-factor) * 375)",
          margin: "0px auto",
          border: "1px solid rgba(0, 0, 0, 0.1)",
        }}
      >
        {Array.from({ length: col * row }).map((_, i) => (
          <Cell pos={gridpos(col, row, i)} key={i} index={i} />
        ))}
      </div>
    </>
  );
}

function Cell({ pos, index }: { pos: Position; index: number }) {
  const [state, dispatch] = useGrid();
  const [col, row] = state.size;
  const [_mx1, _my1, _mx2, _my2] = state.marquee ?? [-1, -1, -1, -1];

  const bind = useGesture(
    {
      onPointerDown: () => {
        dispatch({ type: "pointerdown" });
      },
      onPointerUp: () => {
        dispatch({ type: "pointerup" });
      },
      onPointerMove: () => {
        dispatch({ type: "pointermove", pos: pos });
      },
    },
    {
      drag: {
        enabled: false,
      },
    }
  );

  const is_in_marquee =
    pos[0] >= _mx1 && pos[0] <= _mx2 && pos[1] >= _my1 && pos[1] <= _my2;

  return (
    <div
      {...bind()}
      data-marqueed={is_in_marquee}
      className="hover:bg-pink-200/15 data-[marqueed='true']:bg-pink-200/15"
      style={{
        touchAction: "none",
        border: "0.1px solid rgba(0, 0, 0, 0.1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {state.debug ? (
        <>
          <span className="text-xs font-mono opacity-20">
            {gridpos(col, row, index).join(",")}
          </span>
        </>
      ) : (
        <>
          <PlusIcon className="opacity-20" />
        </>
      )}
    </div>
  );
}

function ImageBlock({ src }: { src: string }) {
  return (
    <picture className="w-full h-full not-prose">
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <img className="object-cover w-full h-full" src={src} />
    </picture>
  );
}

function Grid({
  col,
  row,
  children,
}: React.PropsWithChildren<{
  col: number;
  row: number;
}>) {
  return (
    <div
      className="w-full h-full"
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: `repeat(${col}, 1fr)`,
        gridTemplateRows: `repeat(${row}, 1fr)`,
        // height: "calc(var(--scale-factor) * 750)",
        // width: "calc(var(--scale-factor) * 375)",
        margin: "0px auto",
      }}
    >
      {children}
    </div>
  );
}

function Dragable({
  id,
  children,
}: React.PropsWithChildren<{
  id: string;
}>) {
  return <div className="w-full h-full">{children}</div>;
}

function GridAreaBlock({
  id,
  x,
  y,
  z,
  debug,
  children,
}: React.PropsWithChildren<{
  id: string;
  x: [number, number];
  y: [number, number];
  z?: number;
  debug?: boolean;
}>) {
  const { setNodeRef } = useDraggable({ id });

  return (
    <div
      onPointerEnter={() => {
        // here
        console.log("enter");
      }}
      ref={setNodeRef}
      data-debug={debug}
      className="bg-background data-[debug='true']:bg-pink-300/20 hover:bg-yellow-200"
      style={{
        pointerEvents: "auto",
        gridArea: y[0] + " / " + x[0] + " / " + y[1] + " / " + x[1],
        zIndex: z,
        overflow: "hidden",
        position: "relative",
        padding: "0px",
      }}
    >
      {children}
    </div>
  );
}
