import React from 'react'
import styled from '@emotion/styled';
import { Flex } from 'rebass';

type SectionStyleProps = {
  align?: "left" | "center" | "right",
  margin?: string
}

interface SectionProps {
  align: "left" | "center" | "right",
  title: string,
  description: string
  isButton?: boolean,
  buttonOption?: {
    label: string,
    href: string,
    marginOption: string
  }
}

export function Section(props: SectionProps) {
  const { align, title, description, isButton, buttonOption: { label, href, marginOption } } = props;

  const onHref = () => window.location.assign(href)

  return (
    <Postioner flexDirection="column" alignItems="center">
      <Heading align={align}>{title}</Heading>
      <Desc align={align}>{description}</Desc>
      {isButton && <Button align={align} onClick={onHref} margin={marginOption}>{label}</Button>}
    </Postioner>
  );
}

const Postioner = styled(Flex)`
  margin: 0px 20px;

`

const Heading = styled.h1<SectionStyleProps>`
  text-align: ${p => p.align};
  font-size: 80px;
  max-width: 920px;

  @media (max-width: 767px) {
    font-size: 48px;
  }
`

const Desc = styled.p<SectionStyleProps>`
  text-align: ${p => p.align};
  color: #444545;
  font-size: 24px;
  max-width: 800px;

  @media (max-width: 767px) {
    font-size: 18px;
  }
`

const Button = styled.button<SectionStyleProps>`
  ${p => p.align === "left" && `margin-right: auto`};  
  ${p => p.align === "right" && `margin-left: auto`};  
  margin: ${p => p.margin};
  padding: 12px 28px;
  border: none;
  background-color: #2562FF;
  color: #fff;
  font-size: 18px;
  font-weight: bold;
  border-radius: 100px;
`