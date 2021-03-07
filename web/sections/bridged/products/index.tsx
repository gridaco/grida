import React from 'react'
import SectionLayout from 'layout/section'
import { Flex, Heading, Text } from 'rebass'
import styled from '@emotion/styled';
import { media } from 'utils/styled/media';
import BlankArea from 'components/blank-area';
import { ThemeInterface } from 'utils/styled/theme';
import Link from 'next/link';
import GradientRowList from 'components/gradient-row-list';

const Products = () => {
  return (
    <SectionLayout alignContent="start" >
      <Heading fontSize={["32px", "64px", "64px", "80px"]}>Your design is your</Heading>
      <GradientRowList />
      <SectionLayout variant="content-overflow-1" inherit={false} alignContent="center">
        <Flex width="95%" height="700px" bg="#000" mt="50px" mx="20px" />
      </SectionLayout>
      <Heading fontSize="18px" mt="40px">Instantly create code from your design.</Heading>
      <Description fontSize={["21px", "21px", "21px", "24px"]}>With powerful Design2Code Engine, Bridged generates production ready code that can also easily be used for existing projects. Supprt for components, various code styles, naming convention, fille & directory structure are included.</Description>
      <BlankArea height={30} />
      <More>See also</More>
      <MoreLists>
        <Link href="/">
          <span>idea</span>
        </Link>
        <Link href="/">
          <span>server</span>
        </Link>
        <Link href="/">
          <span>translations</span>
        </Link>
        <Link href="/">
          <span>insight</span>
        </Link>
        <Link href="/">
          <span>everything</span>
        </Link>
      </MoreLists>
      <BlankArea height={150} />
    </SectionLayout>
  )
}

export default Products

const More = styled(Text)`
  padding-bottom: 8px;
  border-bottom: 2px solid black;
`

const MoreLists = styled(Flex)`
  margin-top: 10px;
  
  span {
        margin-right: 24px;
        font-size: 18px;
        color: #AEAEAE;
    }

    @media (max-width: 767px) {
        overflow-x: auto;
        width: 100%;
    }
`

const Description = styled(Text)`
  max-width: 780px;
  margin-top: 20px;
  color: #444545;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    max-width: 280px;
  }
`