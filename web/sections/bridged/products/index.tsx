import React, { useState, useEffect, createRef } from 'react'
import SectionLayout from 'layout/section'
import { Flex, Heading, Text } from 'rebass'
import styled from '@emotion/styled';
import { media } from 'utils/styled/media';
import BlankArea from 'components/blank-area';
import { ThemeInterface } from 'utils/styled/theme';
import Link from 'next/link';
import { motion } from "framer-motion";
import { PRODUCT_LIST } from 'utils/landingpage/constants';

const Products = () => {
  const [x, setX] = useState<number>(0);
  const [beforeClick, setBeforeClick] = useState<number>(0);
  const [counter, setCounter] = useState(1)
 

  const elRefs = React.useRef([]);
  let elWidth = [];
  const spring = {
    type: "spring",
    stiffness: 700,
    damping: 30,
  };

  useEffect(() => {
    const timer =
      counter >= 0 && setInterval(() => {
        if (counter === 0) {
          setX(0);
          setBeforeClick(0)
        } else {
          setCounter(counter - 1)
        }
      }, 1000);
    return () => clearInterval(timer);
  }, [counter]);

  useEffect(() => {
    elRefs.current = Array(PRODUCT_LIST.length)
      .fill(null)
      .map((_, i) => elRefs.current[i] || createRef());
    // console.log("useEffect []", elRefs);
  }, []);

  useEffect(() => {
    if (elRefs.current[0].current !== null) {
      elWidth = elRefs.current.map(
        innerElRef => innerElRef.current.offsetWidth,
      );
    }
  }, [beforeClick, counter]);

  function handleTransform(current: number) {
    if (beforeClick < current) {
      elWidth.map((size, elInedx) => {
        if (current == 0) {
          setX(0)
        } else if (current > elInedx) {
          setX(x - size - 30);
        }
      });
    } else if (beforeClick > current) {
      elWidth.map((size, elInedx) => {
        if (current == 0) {
          setX(0)
        } else if (current == elInedx) {
          setX(x + size + 30);
        }
      });
    }
    setBeforeClick(current);
    setCounter(3)
  }

  return (
    <SectionLayout alignContent="start" >
      <Heading fontSize={["32px", "64px", "64px", "80px"]}>Your design is your</Heading>
      <SectionLayout variant="content-overflow-1" inherit={false} alignContent="center">
        <Container>
          <RowFrame animate={{ x: x }} transition={spring}>
            <Heading fontSize={["32px", "64px", "64px", "80px"]}>
              {PRODUCT_LIST.map((item, i) => {
                return (
                  <List
                    gradient={beforeClick === i ? item.gradient : "#F1F1F1"}
                    onClick={e => {
                      handleTransform(i);
                    }}
                    ref={elRefs.current[i]}
                  >
                    {item.title}
                  </List>
                );
              })}
            </Heading>
          </RowFrame>
        </Container>
      </SectionLayout>
      <SectionLayout variant="content-overflow-1" inherit={false} alignContent="center">
        <Flex width={["95%", "95%", "100%", "100%"]} height="700px" bg="#000" mt="50px" mx={["20px", "20px", 0, 0]} />
      </SectionLayout>
      <Heading fontSize="18px" mt="40px">{PRODUCT_LIST[beforeClick].subTitle}</Heading>
      <Description fontSize={["21px", "21px", "21px", "24px"]}>{PRODUCT_LIST[beforeClick].desc}</Description>
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

const Container = styled(Flex)`
  position: relative;
  width: 100%;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  margin: auto;

  &:before {
    left: 0;
    background: linear-gradient(90deg,#fff,hsla(0,0%,100%,0));
    content: "";
    top: 0;
    width: 8%;
    height: 100%;
    position: absolute;
    z-index: 100;
    pointer-events: none;
  }

  &:after {
    right: 0;
    background: linear-gradient(90deg,hsla(0,0%,100%,0),#fff);
    content: "";
    top: 0;
    width: 8%;
    height: 100%;
    position: absolute;
    z-index: 100;
    pointer-events: none;
  }
`;

const RowFrame = styled(motion.div)`
  display: flex;
  width: 80%;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[2])} {
    width: 95%;
  }
  
  cursor: pointer;

  &[data-isOn="true"] {
    color: "red";
    background-color: "red";
    justify-content: flex-start;
  }
`;

const List = styled.span<{ gradient: string }>`
  padding-left: 10px;
  margin-left: 30px;
  background: ${p => p.gradient};
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  &:first-child {
    margin-left: 0;
    padding-left: 0;
  }
`;
