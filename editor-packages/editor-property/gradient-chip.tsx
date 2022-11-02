import React from "react";
import styled from "@emotion/styled";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "./hover-card";
import type { GradientPaint } from "@design-sdk/figma-types";
import { LinearGradient, Alignment } from "@reflect-ui/core";
import * as k from "./k";
import * as css from "@web-builder/styles";

export function GradientChip({
  onClick,
  gradient,
  snippet,
  size = k.chip_size,
  outline = false,
}: {
  onClick?: ({
    gradient,
    text,
  }: {
    gradient: GradientPaint;
    text: string;
  }) => void;
  gradient: GradientPaint;
  snippet?: string;
  size?: number;
  outline?: boolean;
}) {
  const { gradientStops: stops, gradientTransform: transform, type } = gradient;

  const gradientcss = css.linearGradient(
    new LinearGradient({
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      stops: stops.map((s) => {
        return s.position;
      }),
      colors: stops.map((s) => {
        return s.color;
      }),
    })
  );

  return (
    <HoverCard openDelay={0}>
      <ChipContainer>
        <HoverCardTrigger asChild>
          <span
            style={{
              width: size,
              height: size,
              borderRadius: 2,
              backgroundColor: "white",
              backgroundImage: gradientcss,
            }}
          />
        </HoverCardTrigger>
        <HoverCardContent>
          <CardBody>
            <label>{gradientcss}</label>
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
