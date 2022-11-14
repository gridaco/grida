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
    <HoverCard openDelay={0} closeDelay={0}>
      <ChipContainer
        onClick={() => {
          onClick?.({
            color,
            text,
          });
        }}
      >
        <HoverCardTrigger asChild>
          <div>
            <Chip
              color={color}
              value={csscolor}
              size={size}
              borderRadius={4}
              outline={outline ? "1px solid white" : "none"}
            />
          </div>
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

/**
 * Color chip with alpha view
 *
 * if Alpha, display divided into 2 parts
 */
function Chip({
  outline,
  size = 24,
  color,
  value,
  borderRadius = 4,
}: {
  color: Color;
  value: string;
  size: number;
  outline?: React.CSSProperties["outline"];
  borderRadius?: React.CSSProperties["borderRadius"];
}) {
  const { r, g, b, o } = color;

  const Body = () => {
    if (o < 1) {
      return (
        <>
          <span
            style={{
              display: "block",
              background: value,
              width: size / 2,
              height: size,
            }}
          />
          <span
            style={{
              display: "block",
              opacity: o,
              background: k.alpha_channel_chess_image,
              width: size / 2,
              height: size,
            }}
          />
        </>
      );
    } else {
      return (
        <span
          style={{
            // todo - support alpha chanel bg
            background: value,
            width: size,
            height: size,
            outline: outline,
            borderRadius: borderRadius,
          }}
        />
      );
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        width: size,
        height: size,
        outline: outline,
        background: `rgb(${rd(r * 255)}, ${rd(g * 255)}, ${rd(b * 255)})`,
        borderRadius: borderRadius,
      }}
    >
      <Body />
    </div>
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
