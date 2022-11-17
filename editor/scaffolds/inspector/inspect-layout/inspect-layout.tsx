import React, { useCallback, useMemo } from "react";
import styled from "@emotion/styled";
import { useDrag, useGesture } from "@use-gesture/react";
import { useTargetContainer } from "hooks/use-target-node";
import { visit } from "tree-visit";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
import { useDispatch } from "core/dispatch";

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

  if (!(target?.children?.length > 0 && flattened.length > 0)) return <></>;

  return (
    <Canvas projection="perspective" scale={0.5}>
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

type Projection = "perspective" | "orthographic";
function Canvas({
  children,
  projection,
  scale = 1,
}: React.PropsWithChildren<{ projection: Projection; scale?: number }>) {
  const ref = React.useRef<HTMLDivElement>(null);

  const [transform, setTransform] = React.useState<{
    offsetX: number;
    offsetY: number;
    rotateX: number;
    rotateY: number;
  }>({
    offsetX: 0,
    offsetY: 100,
    rotateX: 0,
    rotateY: 0,
  });

  useGesture(
    {
      onDrag: ({ delta, metaKey, event }) => {
        if (metaKey) {
          const [dx, dy] = delta;
          const _new = {
            offsetX: minmax(-2000, 2000, transform.offsetX + dx / scale),
            offsetY: minmax(-2000, 100, transform.offsetY + dy / scale),
            rotateX: transform.rotateX,
            rotateY: transform.rotateY,
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
          };
          setTransform(_new);

          event.stopImmediatePropagation();
          event.stopPropagation();
          event.preventDefault();
        }
        //
      },
    },
    {
      target: ref,
    }
  );

  return (
    <div
      ref={ref}
      style={{
        userSelect: "none",
        width: "100%",
        height: 300,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          willChange: "transform",
          transformStyle: "preserve-3d",
          perspective: projection === "perspective" ? 1000 : undefined,
          position: "relative",
          transformOrigin: "top center",
          transform: `rotateX(${transform.rotateX}deg) rotateY(${transform.rotateY}deg) scale(${scale}) translate3d(${transform.offsetX}px, ${transform.offsetY}px, 0)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
