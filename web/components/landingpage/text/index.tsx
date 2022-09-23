import React from "react";
import { Heading, Text } from "theme-ui";
const h1FontSizes = ["32px", "64px", "64px", "80px"];
const h2FontSizes = ["32px", "64px", "64px", "64px"];
const h4FontSizes = ["32px", "36px", "36px", "36px"];
const body1FontSizes = ["21px", "21px", "21px", "24px"];
export default function LandingpageText({
  children,
  variant,
  textAlign,
  color,
  className,
  fontWeight,
  fontFamily,
}: {
  variant: "h1" | "h2" | "h4" | "body1";
  color?: string;
  fontWeight?: React.CSSProperties["fontWeight"];
  fontFamily?: React.CSSProperties["fontFamily"];
  className?: string;
  textAlign?:
    | "center"
    | "end"
    | "justify"
    | "left"
    | "match-parent"
    | "right"
    | "start";
  children: React.ReactNode;
}) {
  switch (variant) {
    case "h1":
      return (
        <Heading
          as="h1"
          className={className}
          sx={{
            textAlign: textAlign,
            fontSize: h1FontSizes,
            letterSpacing: "-0.03em",
            lineHeight: "97.1%",
            color: color,
            fontWeight: fontWeight,
            fontFamily: fontFamily,
          }}
        >
          {children}
        </Heading>
      );
    case "h2":
      return (
        <Heading
          as="h2"
          className={className}
          sx={{
            textAlign: textAlign,
            fontSize: h2FontSizes,
            letterSpacing: "0em",
            lineHeight: "98.1%",
            color: color,
            fontWeight: fontWeight,
            fontFamily: fontFamily,
          }}
        >
          {children}
        </Heading>
      );
    case "h4":
      return (
        <Heading
          as="h4"
          className={className}
          sx={{
            letterSpacing: "0em",
            color: color,
            textAlign: textAlign,
            fontSize: h4FontSizes,
            fontWeight: fontWeight,
            fontFamily: fontFamily,
          }}
        >
          {children}
        </Heading>
      );
    case "body1":
      return (
        <Text
          as="p"
          className={className}
          sx={{
            lineHeight: "38px",
            letterSpacing: "0em",
            color: color ?? "#444545",
            textAlign: textAlign,
            fontWeight: fontWeight ?? 400,
            fontSize: body1FontSizes,
            fontFamily: fontFamily,
          }}
        >
          {children}
        </Text>
      );
  }

  return <p>{children}</p>;
}
