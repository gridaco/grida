import React, { useState } from 'react'
import { Box, Flex, Text } from 'rebass';
import styled from '@emotion/styled';


const GradientSolutions = ({ list }) => {
  const [currentGradient, setCurrentGradient] = useState("code");
  
  return (
    <Postioner>
      <LeftFade />
      <ScrollView>
        {list.map(i => <span className="cursor" onClick={() => setCurrentGradient(i.title)} style={currentGradient === i.title ? { backgroundImage : i.gradient } : { color : "#F1F1F1"}}>{i.title}</span>)}
      </ScrollView>
      <RightFade />
    </Postioner>
  )
}

export default GradientSolutions

const Postioner = styled(Box)`
  position: relative;
  width: 100%;
  height: 50px;
`

const ScrollView = styled(Flex)`
  overflow-x: auto;
  padding: 0px 150px;

  span {
    margin: 0px 20px;
    font-size: 80px;
    font-weight: bold;
    color:transparent;
    -webkit-background-clip: text;
    background-clip: text;
   

    &:last-child {
      padding-right: 200px;
    }
  }

  

`

const LeftFade = styled(Box)`
  position: absolute;
  width: 200px;
  height: 100px;
  background: linear-gradient(270deg, rgba(255, 255, 255, 0) 0%, #FFFFFF 51.56%);
`

const RightFade = styled(Box)`
  position: absolute;
  width: 200px;
  height: 100px;
  top: 0;
  right: 0;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, #FFFFFF 48.44%)
`