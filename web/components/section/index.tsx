import React from 'react'
import styled from '@emotion/styled';
import { Flex } from 'rebass';

type SectionStyleProps = {
  align?: "left" | "center" | "right",
  margin?: string,
}

interface SectionProps {
  align: "left" | "center" | "right",
  title: string,
  description: string
  isButton?: boolean,
  margin?: string,
  buttonOption?: {
    label?: string,
    href?: string,
    marginOption?: string
  }
}

export function Section(props: SectionProps) {
  const { align, title, description, isButton, buttonOption, margin } = props;

  const onHref = () => window.location.assign(buttonOption?.href)

  return (
    <Postioner flexDirection="column" alignItems="center" align={align} margin={margin}>
      <Heading className="section-heading" align={align} dangerouslySetInnerHTML={{ __html : title.replace(/\n/g, '<br/>') }} />
      <Desc className="section-desc" align={align}>{description}</Desc>
      {isButton && <Button align={align} onClick={onHref} margin={buttonOption?.marginOption}>{buttonOption?.label}</Button>}
    </Postioner>
  );
}

const Postioner = styled(Flex)<SectionStyleProps>`
  margin: ${p => p.margin ? p.margin : '0px 20px'};
  ${p => p.align === "left" && `margin-right: auto`};  
  ${p => p.align === "right" && `margin-left: auto`};  
`

const Heading = styled.h1<SectionStyleProps>`
  text-align: ${p => p.align};
  ${p => p.align === "left" && `margin-right: auto`};  
  ${p => p.align === "right" && `margin-left: auto`};  
  font-size: 80px;
  max-width: 920px;

  @media (max-width: 767px) {
    font-size: 48px;
  }
`

const Desc = styled.p<SectionStyleProps>`
  text-align: ${p => p.align};
  white-space: pre-line;
  ${p => p.align === "left" && `margin-right: auto`};  
  ${p => p.align === "right" && `margin-left: auto`};  
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