import styled from "@emotion/styled";
import { LinkWithDocsFallback } from "components/fixme";
import Image from "next/image";
import Link from "next/link";
import React from "react";

import { GroupEntity } from "../headermap";

export function ModuleGroup({ label, href, children }: GroupEntity) {
  return (
    <Group>
      <GroupLabel>{label}</GroupLabel>
      {children.map(c => (
        <ModuleItem
          key={c.label}
          label={c.label}
          href={c.href}
          icon={c["icon"]}
        />
      ))}
    </Group>
  );
}

const GroupLabel = styled.label`
  color: rgba(0, 0, 0, 0.5);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Inter, sans-serif;
  font-weight: 400;
  text-align: left;
  margin-bottom: 16px;
`;

const Group = styled.div`
  display: flex;
  flex-direction: column;
  padding: 0 16px;
  margin-bottom: 16px;
`;

export function ModuleItem({
  label,
  icon,
  href,
}: {
  label: string;
  icon: string;
  href: string;
}) {
  const [hovering, setHovering] = React.useState(false);

  return (
    <LinkWithDocsFallback href={href}>
      <Wrapper
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <IconSet>
          <Icon opacity={0.8} data-hidden={hovering}>
            <Image
              priority
              width={21}
              height={21}
              src={icon + "/black.svg"}
              alt={label}
            />
          </Icon>
          <Icon opacity={1} data-hidden={!hovering}>
            <Image
              width={21}
              height={21}
              src={icon + "/default.svg"}
              alt={label}
            />
          </Icon>
        </IconSet>
        <Name>{label}</Name>
      </Wrapper>
    </LinkWithDocsFallback>
  );
}

const Wrapper = styled.div`
  min-width: 200px;
  width: fit-content;
  padding: 8px;
  padding-right: 12px;
  cursor: pointer;
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  box-sizing: border-box;

  :hover {
    background-color: rgba(0, 0, 0, 0.05);
  }

  transition: all 0.1s ease-in-out;
`;

const IconSet = styled.div`
  position: relative;
  width: 21px;
  height: 21px;
`;

const Icon = styled.div<{ opacity: number }>`
  position: absolute;
  opacity: ${props => props.opacity};

  &[data-hidden="true"] {
    opacity: 0;
  }

  transition: all 0.1s ease-in-out;
`;

const Name = styled.span`
  color: rgba(0, 0, 0, 0.8);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Inter, sans-serif;
  font-weight: 600;
  text-align: left;
`;
