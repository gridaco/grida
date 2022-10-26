import styled from "@emotion/styled";
import React, { CSSProperties } from "react";

const _theme_section_border = "1px solid rgba(255, 255, 255, 0.05)";

export function InspectorSection({
  children,
  label,
  contentPadding = "14px 14px 14px 24px",
  actions,
  border,
  borderTop,
  borderBottom,
}: React.PropsWithChildren<{
  label: string;
  contentPadding?: CSSProperties["padding"];
  actions?: React.ReactNode;
  border?: { top?: boolean; bottom?: boolean } | boolean;
  borderTop?: boolean;
  borderBottom?: boolean;
}>) {
  const _border_top =
    borderTop === true
      ? true
      : typeof border === "boolean"
      ? border
      : border?.top === true;
  const _border_bottom =
    borderBottom === true
      ? true
      : typeof border === "boolean"
      ? border
      : border?.bottom === true;

  return (
    <Section
      borderBottom={_border_bottom ? _theme_section_border : "none"}
      borderTop={_border_top ? _theme_section_border : "none"}
    >
      <Header>
        <InfoSectionLabel>{label}</InfoSectionLabel>
        {actions && <>{actions}</>}
      </Header>
      <div
        style={{
          padding: contentPadding,
        }}
      >
        {children}
      </div>
    </Section>
  );
}

const InfoSectionLabel = styled.h6`
  color: white;
  font-size: 12px;
  font-weight: 500;
  margin: 0;
  cursor: default;
`;

const Header = styled.header`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-left: 14px;
  padding-right: 14px;
`;

const Section = styled.section<{
  borderTop: React.CSSProperties["borderTop"];
  borderBottom: React.CSSProperties["borderBottom"];
}>`
  display: flex;
  flex-direction: column;
  padding-top: 12px;
  padding-bottom: 16px;
  border-top: ${(props) => props.borderTop};
  border-bottom: ${(props) => props.borderBottom};
`;
