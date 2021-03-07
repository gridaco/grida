import React from 'react'
import styled from '@emotion/styled';
import { ThemeInterface } from 'utils/styled/theme';
import { media } from 'utils/styled/media';

const OnairButton = () => {
  return (
    <Button>
      ON AIR
    </Button>
  )
}

const Button = styled.button`
  margin-right: auto;
  margin-top: 20px;
  // region gradient animation
  background: linear-gradient(318deg, #f537ff, #ff6565, #ff379f, #ff373e);
  background-size: 800% 800%;

  // DISABLING DUE TO PURFORMANCE ISSUE WITH GRADIENT ANIMATION
  /* animation: AutoGradient 3s ease infinite; */
  /* 
  @keyframes AutoGradient {
    0% {
      background-position: 0% 42%;
    }
    50% {
      background-position: 100% 59%;
    }
    100% {
      background-position: 0% 42%;
    }
  } */
  // endregion gradient animation

  box-shadow: 0px 4px 32px rgba(255, 0, 0, 0.25);
  width: 140px;
  padding: 12px;
  border: none;
  border-radius: 19px;
  color: #fff;
  font-size: 32px;
  font-weight: bold;

  ${props => media((props.theme as ThemeInterface).breakpoints[0], null)} {
    margin-left: 20px;
    margin-top: 0px;
  }
`;

export default OnairButton
