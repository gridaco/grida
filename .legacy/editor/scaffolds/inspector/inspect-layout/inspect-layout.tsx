import React, { forwardRef, useCallback, useEffect, useMemo } from "react";
import styled from "@emotion/styled";
import { useDrag, useGesture } from "@use-gesture/react";
import { useTargetContainer } from "hooks/use-target-node";
import { visit } from "tree-visit";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
import { useDispatch } from "core/dispatch";
import { ReloadIcon } from "@radix-ui/react-icons";
import { motion } from "framer-motion";
import useMeasure from "react-use-measure";

type FlatScebeBode = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // absolute relative to the root
  absoluteX: number;
  // absolute relative to the root
  absoluteY: number;
  depth: number;
};

const _CONTENT_MARGIN_TOP = 80;

const flatten = (node: ReflectSceneNode) => {
  const [rx, ry] = [node.absoluteX, node.absoluteY];
  const result: FlatScebeBode[] = [];

  visit(node, {
    getChildren: (node) => {
      return node.children;
    },
    onEnter(node, indexPath) {
      const d = {
        id: node.id,
        name: node.name,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        absoluteX: node.absoluteTransform[0][2] - rx,
        absoluteY: node.absoluteTransform[1][2] - ry,
        depth: indexPath.length,
      };
      result.push(d);
    },
  });

  return result;
};

export function InspectLayout() {
  //
  const dispatch = useDispatch();
  const { target } = useTargetContainer();
  const [selected, setSelected] = React.useState<string>(null);
  const [scale, setScale] = React.useState(0);

  const [ref, bound] = useMeasure();

  const highlight = useCallback(
    (id: string) => {
      dispatch({
        type: "highlight-node",
        id: id,
      });
    },
    [dispatch]
  );

  const flattened = useMemo(
    () => (target ? flatten(target) : []),
    [target?.id]
  );

  useEffect(() => {
    if (target?.width && bound.width > 0) {
      const margin = _CONTENT_MARGIN_TOP;
      const s = bound.width / (target.width + margin);
      setScale(s);
    }
  }, [bound.width, target?.width]);

  if (!(target?.children?.length > 0 && flattened.length > 0)) return <></>;

  return (
    <motion.div
      initial={{
        opacity: 0,
      }}
      animate={{
        opacity: 1,
      }}
    >
      <Canvas
        ref={ref}
        projection="perspective"
        scale={scale}
        height={target.height * scale + _CONTENT_MARGIN_TOP}
        contentMeta={{
          width: target.width,
          height: target.height,
        }}
      >
        <Container
          style={{
            width: target.width,
            height: target.height,
            background: "rgba(0,0,0,0.5)",
          }}
        >
          {flattened.map((node: FlatScebeBode) => {
            return (
              <Layer
                key={node.id}
                width={node.width}
                height={node.height}
                depth={node.depth}
                x={node.absoluteX}
                y={node.absoluteY}
                selected={selected === node.id}
                onClick={() => {
                  highlight(node.id);
                  setSelected(node.id);
                }}
              />
            );
          })}
        </Container>
      </Canvas>
    </motion.div>
  );
}

const Container = styled.div`
  perspective: 1000;
  transform-style: preserve-3d;
`;

function Layer({
  x,
  y,
  width,
  height,
  depth,
  onClick,
  selected,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        width,
        height,
        background: selected
          ? "rgba(150, 150, 255, 0.5)"
          : "rgba(232, 255, 168, 0.3)",
        position: "absolute",
        outline: selected
          ? "1px solid rgba(150, 150, 255, 0.8)"
          : "1px solid rgba(232, 255, 168, 0.8)",
        transform: `translate3d(${x}px, ${y}px, ${depth * 10}px)`,
      }}
    />
  );
}

const minmax = (min: number, max: number, value: number) => {
  return Math.min(Math.max(min, value), max);
};

const initialtransform = {
  offsetX: 0,
  offsetY: _CONTENT_MARGIN_TOP,
  rotateX: 0,
  rotateY: 0,
  scale: 1,
};

type Projection = "perspective" | "orthographic";
const Canvas = forwardRef(function (
  {
    children,
    projection,
    contentMeta,
    height = 0,
    scale = 0.5,
  }: React.PropsWithChildren<{
    projection: Projection;
    scale?: number;
    height?: number;
    contentMeta: {
      width: number;
      height: number;
    };
  }>,
  fref: React.Ref<HTMLDivElement>
) {
  const gestureref = React.useRef<HTMLDivElement>(null);

  const [transform, setTransform] = React.useState<{
    offsetX: number;
    offsetY: number;
    rotateX: number;
    rotateY: number;
    scale: number;
  }>({ ...initialtransform, scale });

  const [helpinfo, setHelpInfo] = React.useState("");

  useEffect(() => {
    setTransform({ ...initialtransform, scale });
  }, [scale]);

  const canReset = React.useMemo(() => {
    return (
      transform.offsetX !== initialtransform.offsetX ||
      transform.offsetY !== initialtransform.offsetY ||
      transform.rotateX !== initialtransform.rotateX ||
      transform.rotateY !== initialtransform.rotateY
    );
  }, [JSON.stringify(transform)]);

  const mode3d = React.useMemo(() => {
    return (
      transform.rotateX !== initialtransform.rotateX ||
      transform.rotateY !== initialtransform.rotateY
    );
  }, [JSON.stringify(transform)]);

  const reset = () => {
    setTransform({
      ...initialtransform,
      scale: scale,
    });
  };

  const displayhelp = (info: string) => {
    if (!helpinfo) {
      setHelpInfo(info);
      setTimeout(() => {
        setHelpInfo("");
      }, 1000);
    }
  };

  const appliedscale = transform.scale;

  useGesture(
    {
      onDrag: ({ delta, metaKey, event }) => {
        if (metaKey) {
          const [dx, dy] = delta;
          const _new = {
            offsetX: minmax(-2000, 2000, transform.offsetX + dx / appliedscale),
            offsetY: minmax(-2000, 100, transform.offsetY + dy / appliedscale),
            rotateX: transform.rotateX,
            rotateY: transform.rotateY,
            scale: transform.scale,
          };
          setTransform(_new);
        } else {
          const [dx, dy] = delta;
          const { rotateX, rotateY } = transform;
          const _new = {
            offsetX: transform.offsetX,
            offsetY: transform.offsetY,
            rotateX: minmax(-95, 95, rotateX - dy * 0.5),
            rotateY: minmax(-95, 95, rotateY + dx * 0.5),
            scale: transform.scale,
          };
          setTransform(_new);

          event.stopImmediatePropagation();
          event.stopPropagation();
          event.preventDefault();
        }
        //
      },
      onPinch: ({ delta: [d], _delta: [_d], event }) => {
        const _new = {
          offsetX: transform.offsetX,
          offsetY: transform.offsetY,
          rotateX: transform.rotateX,
          rotateY: transform.rotateY,
          scale: minmax(0.1, 10, transform.scale + d),
        };
        setTransform(_new);

        event.stopImmediatePropagation();
        event.stopPropagation();
        event.preventDefault();
      },
      onWheel: ({ delta: [dx, dy], event, metaKey }) => {
        if (metaKey) {
          const _new = {
            offsetX: minmax(-2000, 2000, transform.offsetX - dx / appliedscale),
            offsetY: minmax(-2000, 100, transform.offsetY - dy / appliedscale),
            rotateX: transform.rotateX,
            rotateY: transform.rotateY,
            scale: transform.scale,
          };
          setTransform(_new);

          event.stopImmediatePropagation();
          event.stopPropagation();
          event.preventDefault();
        } else {
          displayhelp("Hold ⌘ to pan. Drag to tilt.");
        }
      },
    },
    {
      target: gestureref,
      eventOptions: {
        passive: false,
      },
    }
  );

  return (
    <div ref={fref}>
      <div
        ref={gestureref}
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "center",
          userSelect: "none",
          width: "100%",
          height,
          maxHeight: 300,
          overflow: "hidden",
        }}
      >
        <HelpDisplay
          style={{
            opacity: helpinfo ? 1 : 0,
          }}
        >
          {helpinfo}
        </HelpDisplay>
        <div
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            zIndex: 9,
          }}
        >
          {canReset && (
            <IconButton
              onClick={reset}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.2 }}
            >
              <ReloadIcon color="white" />
            </IconButton>
          )}
        </div>
        <TransformContainer
          style={{
            width: contentMeta.width,
            height: contentMeta.height,
            perspective:
              projection === "perspective"
                ? mode3d
                  ? 1000
                  : undefined
                : undefined,
            transform: `rotateX(${transform.rotateX}deg) rotateY(${transform.rotateY}deg) scale(${transform.scale}) translate3d(${transform.offsetX}px, ${transform.offsetY}px, 0)`,
          }}
        >
          {children}
        </TransformContainer>
      </div>
    </div>
  );
});

const HelpDisplay = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  pointer-events: none;
  position: absolute;
  opacity: 0;
  background: rgba(0, 0, 0, 0.5);
  color: white;

  top: 0;
  left: 0;
  right: 0;
  bottom: 0;

  z-index: 99;

  transition: opacity 0.2s ease-in-out;
`;

const TransformContainer = styled.div`
  position: relative;
  will-change: transform;
  transform-style: preserve-3d;
  transform-origin: top center;
  perspective: none;
  transition: transform 0.12s ease;
`;

const IconButton = styled(motion.button)`
  display: flex;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  border: none;
  padding: 8px;
  cursor: pointer;
  outline: none;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
`;
