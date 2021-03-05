import React, { useState } from 'react'
import { Box, Flex, Text } from 'rebass';
import styled from '@emotion/styled';


const GradientSolutions = ({ list, currentSolution, changeSolution }) => {

  return (
    <Postioner>
      <LeftFade />
      <ScrollView>
        {list.map(i => <span className="cursor" onClick={() => changeSolution(i.title)} style={currentSolution === i.title ? { backgroundImage: i.gradient } : { color: "#F1F1F1" }}>{i.title}</span>)}
      </ScrollView>
      <RightFade />
    </Postioner>
  )
}

export default GradientSolutions

const Postioner = styled(Flex)`
  position: relative;
  width: 100%;
  height: 50px;

  
  @media(max-width: 768px) {
    margin-top: 20px;
  }
`

const ScrollView = styled(Flex)`
  overflow-x: auto;


  

  span {
    height: auto;
    margin: 0px 20px;
    font-size: 80px;
    font-weight: bold;
    color:transparent;
    -webkit-background-clip: text;
    background-clip: text;

    @media(max-width: 768px) {
      font-size: 36px;
    }
   

    &:first-child {
      padding-left: 100px;
    }
    
    &:last-child {
      padding-right: 100px;
    }
  }

  

`

const LeftFade = styled(Box)`
  position: absolute;
  width: 200px;
  height: 100px;
  background: linear-gradient(270deg, rgba(255, 255, 255, 0) 0%, #FFFFFF 51.56%);
  @media(max-width: 400px) {
    width: 50px
  }
`

const RightFade = styled(Box)`
  position: absolute;
  width: 200px;
  height: 100px;
  top: 0;
  right: -10%;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, #FFFFFF 48.44%);
  @media(max-width: 400px) {
    width: 50px
  }
`