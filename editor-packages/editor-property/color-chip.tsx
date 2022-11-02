import React from "react";
import styled from "@emotion/styled";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "./hover-card";
import * as k from "./k";
import * as css from "@web-builder/styles";

const rd = (d) => Math.round((d + Number.EPSILON) * 100) / 100;

type Color = { r: number; g: number; b: number; o: number };

export function ColorChip({
  onClick,
  color,
  snippet,
  size = k.chip_size,
  outline = false,
}: {
  onClick?: ({ color, text }: { color: Color; text: string }) => void;
  color: Color;
  snippet?: string;
  size?: number;
  outline?: boolean;
}) {
  const csscolor = css.color({
    r: color.r * 255,
    g: color.g * 255,
    b: color.b * 255,
    a: color.o,
  });

  const text = snippet || csscolor;

  return (
    <HoverCard openDelay={0}>
      <ChipContainer
        onClick={() => {
          onClick?.({
            color,
            text,
          });
        }}
      >
        <HoverCardTrigger asChild>
          <span
            style={{
              // todo - support alpha chanel bg
              background: csscolor,
              width: size,
              height: size,
              border: outline ? "1px solid white" : "none",
              borderRadius: 2,
            }}
          />
        </HoverCardTrigger>
        <HoverCardContent>
          <CardBody>
            <label>{text}</label>
          </CardBody>
        </HoverCardContent>
      </ChipContainer>
    </HoverCard>
  );
}

const CardBody = styled.div`
  padding: 8px;
  label {
    font-size: 10px;
    color: black;
    transition: width 0.2s ease;
  }
`;

const ChipContainer = styled.div`
  cursor: pointer;
  background: transparent;
  display: flex;
  flex-direction: row;
  gap: 4px;
  align-items: center;
  transition: all 0.2s ease;

  &:hover {
    transform: scale(1.1);
  }
`;
