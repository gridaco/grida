import React from "react";
import styled from "@emotion/styled";

export function EditorPreferenceBreadcrumb({
  route,
  textTransform,
  base,
  onRoute,
}: {
  route: string;
  base?: string;
  textTransform?: React.CSSProperties["textTransform"];
  onRoute?: (route: string) => void;
}) {
  const segments = route.split("/").filter(Boolean);
  const current = segments[segments.length - 1];
  const parents = segments.slice(0, segments.length - 1);

  return (
    <Container>
      {!!base && (
        <Segment data-disabled style={{ textTransform }}>
          {base} /
        </Segment>
      )}
      {parents.map((p, ix) => (
        <Segment
          key={ix}
          onClick={() => {
            onRoute?.("/" + segments.slice(0, ix + 1).join("/"));
          }}
          style={{
            textTransform,
          }}
        >
          {p} /
        </Segment>
      ))}
      <Segment
        data-current={true}
        style={{
          textTransform,
        }}
      >
        {current}
      </Segment>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: flex-start;
  flex: none;
  gap: 2px;
  box-sizing: border-box;
`;

const Segment = styled.span`
  cursor: pointer;
  user-select: none;
  padding: 4px;
  border-radius: 2px;
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: Inter, sans-serif;
  font-weight: 400;
  text-align: left;

  color: rgba(255, 255, 255, 0.5);

  &[data-current="true"] {
    color: white;
  }

  &[data-disabled="true"] {
    cursor: default;
  }

  &[data-disabled="true"] {
    cursor: default;
    pointer-events: none;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  &:active {
    background: rgba(255, 255, 255, 0.2);
  }

  transition: all 0.2s ease-in-out;
`;
