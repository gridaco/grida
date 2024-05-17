"use client";
import { produce } from "immer";
import { PlusIcon } from "@radix-ui/react-icons";
import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { useGesture } from "@use-gesture/react";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
const ReactPlayer = dynamic(() => import("react-player/lazy"), { ssr: false });

const blockpresets = [
  { type: "button", label: "Button" },
  { type: "text", label: "Text" },
  { type: "link", label: "Link" },
  { type: "image", label: "Image" },
  { type: "video", label: "Video" },
  { type: "youtue", label: "YouTube" },
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
  pos: Position;
  dragging: boolean;
  start?: Position;
  end?: Position;
  controls: {
    insert_panel_open: boolean;
  };
  selected?: BlockId;
  marquee?: Area;
  debug?: boolean;
  size: Size;
  blocks: Block[];
}

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

const initial: State = {
  pos: [0, 0],
  dragging: false,
  selected: undefined,
  marquee: undefined,
  controls: {
    insert_panel_open: false,
  },
  size: [6, 12],
  blocks: [],
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
      <Dialog
        open={state.controls.insert_panel_open}
        onOpenChange={(open) => {
          dispatch({ type: "controls/insert_panel_open", open: open });
        }}
      >
        <DialogContent>
          {blockpresets.map((block) => (
            <button
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
              {block.label}
            </button>
          ))}
          <div className="bg-red-50 w-10 h-10" />
        </DialogContent>
      </Dialog>
      <GridGuide col={6} row={12} />
      <Grid col={6} row={12}>
        {state.blocks.map((block) => (
          <GridAreaBlock x={block.x} y={block.y} z={block.z} key={block.id}>
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
  return [x, y] as const;
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

function GridAreaBlock({
  x,
  y,
  z,
  debug,
  children,
}: React.PropsWithChildren<{
  x: [number, number];
  y: [number, number];
  z?: number;
  debug?: boolean;
}>) {
  return (
    <div
      data-debug={debug}
      className="data-[debug='true']:bg-pink-300/20"
      style={{
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
