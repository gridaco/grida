import React, { useEffect, useRef, useState } from "react";
import { Box, Flex, Text } from "rebass";
import styled from "@emotion/styled";
const AUTO_RESET_SEC = 3;
const GradientSolutions = ({ list, currentSolution, changeSolution, type }) => {
  const scrollabelDiv = useRef(null);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(3);
  const [currentX, setCurrentX] = useState(0);

  useEffect(() => {
    if (seconds === 0) {
      if (window.screen.availWidth >= 769) {
        scrollabelDiv.current.scrollLeft = list[0].width[0];
      } else {
        setCurrentX(list[0].width[1])
        // scrollabelDiv.current.scrollLeft = list[0].width[1];
      }
      changeSolution("code");
    }

    const countdown = setInterval(() => {
      if (seconds > 0) {
        setSeconds(seconds - 1);
      }
      if (seconds === 0) {
        if (minutes === 0) {
          clearInterval(countdown);
        } else {
          setMinutes(minutes - 1);
          setSeconds(59);
        }
      }
    }, 1000);
    return () => clearInterval(countdown);
  }, [minutes, seconds]);

  useEffect(() => {
    if (scrollabelDiv.current != null) {
      if (window.screen.availWidth >= 769) {
        scrollabelDiv.current.scrollLeft = list[0].width[0];
      } else {
        scrollabelDiv.current.scrollLeft = list[0].width[1];
      }
    }
  }, [scrollabelDiv]);

  return (
    <Postioner className="no-drag">
      <ScrollView ref={scrollabelDiv} style={{ transform: `translateX(-${currentX}px) translateZ(0px)` }}>
        <Desktop width="100%">
          {list.map((i, ix) => (
            <span
              className="cursor"
              onClick={() => {
                changeSolution(i.title);
                scrollabelDiv.current.scrollLeft = i.width[0];
                setSeconds(AUTO_RESET_SEC);
              }}
              style={
                currentSolution === i.title
                  ? { backgroundImage: i.gradient }
                  : { color: "#F1F1F1" }
              }
            >
              {i.title}
            </span>
          ))}
        </Desktop>
        <Mobile width="100%">
          {list.map((i, ix) => (
            <span
              className="cursor"
              onClick={() => {
                changeSolution(i.title);
                setCurrentX(i.width[1]);
                // scrollabelDiv.current.scrollLeft = i.width[1];
                setSeconds(AUTO_RESET_SEC);
              }}
              style={
                currentSolution === i.title
                  ? { backgroundImage: i.gradient }
                  : { color: "#F1F1F1" }
              }
            >
              {i.title}
            </span>
          ))}
        </Mobile>
      </ScrollView>
    </Postioner>
  );
};

export default GradientSolutions;

const Mobile = styled(Box)`
  display: none;
  @media (max-width: 769px) {
    display: block;
  }
`;

const Desktop = styled(Box)`
  will-change: transform;
  @media (max-width: 770px) {
    display: none;
  }
`;

const Postioner = styled(Flex)`
  position: relative;
  width: 150%;
  height: 100px;

  @media (max-width: 768px) {
    margin-top: 20px;
    height: 40px;
  }
`;

const ScrollView = styled(Flex)`
  width: 100%;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;

  &:before {
    left: 0;
    background: linear-gradient(90deg, #fff, hsla(0, 0%, 100%, 0));
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
    background: linear-gradient(90deg, hsla(0, 0%, 100%, 0), #fff);
    content: "";
    top: 0;
    width: 8%;
    height: 100%;
    position: absolute;
    z-index: 100;
    pointer-events: none;
  }

  span {
    height: auto;
    margin: 0px 20px;
    font-size: 80px;
    font-weight: bold;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;

    @media (max-width: 768px) {
      font-size: 36px;
    }

    &:first-child {
      margin-left: 17%;
    }

    &:last-child {
      margin-right: 1000px;
    }
  }

  @media (max-width: 768px) {
    transition: transform 330ms ease-in-out;

    &:before {
      content: none;
    }

    &:after {
      content: none;
    }

    span {

      @media (max-width: 1025px) {
        &:first-child {
          margin-left: 250px;
        }
      }

      @media (max-width: 900px) {
        &:first-child {
          margin-left: 210px;
        }
      }

      @media (max-width: 769px) {
        &:first-child {
          margin-left: 260px;
        }
      }

      @media (max-width: 425px) {
        &:first-child {
          margin-left: 170px;
        }
      }

      @media (max-width: 375px) {
        &:first-child {
          margin-left: 160px;
        }
      }

      @media (max-width: 320px) {
        &:first-child {
          margin-left: 140px;
        }
      }
    }
  }
`;

const LeftFade = styled(Box)`
  position: absolute;
  width: 200px;
  height: 100px;
  background: linear-gradient(
    270deg,
    rgba(255, 255, 255, 0) 0%,
    #ffffff 51.56%
  );
  top: 0px;
  left: -15%;
  @media (max-width: 400px) {
    width: 50px;
  }
`;

const RightFade = styled(Box)`
  position: absolute;
  width: 200px;
  height: 100px;
  top: 0;
  right: -10%;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, #ffffff 48.44%);
  @media (max-width: 400px) {
    width: 50px;
  }
`;
