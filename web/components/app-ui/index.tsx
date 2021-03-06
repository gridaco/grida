import React from 'react'
import { Box, Flex } from 'rebass';
import styled from '@emotion/styled';
import Icon from 'components/icon';

const Album = () => {
  return <AlbumWrapper flexDirection='column'  >
    <Box width="90px" height="90px" bg='#000' mr="25px" />
    <span className="album-info" style={{ marginTop: 5, color: "#4a4a4a" }}>Morning Slowbeats -<br />LoFi</span>

  </AlbumWrapper>
}

const AlbumWrapper = styled(Flex)`
`

const Image = styled.div`
  width: 100px !important;
  height: 100px !important;
  background-color: #000;
`

const Music = () => {
  return <Flex alignItems="center" mb="20px" bg='#fff' style={{ boxShadow: "0px 6.90133px 41.408px 6.90133px rgba(111, 111, 111, 0.08)", borderRadius: 7 }}>
    <Box className="music-profile" width="90px" height="90px" bg='#000' />
    <Flex flexDirection="column" height="100%" ml="10px">
      <h1 className="music-title" style={{ margin: 0, marginTop: 10, fontSize: 25 }}>TRIPPE</h1>
      <span className="music-info" style={{ marginTop: 5, color: "#4a4a4a" }}>Morning Slowbeats - LoFi</span>
    </Flex>
    <Icon name="play" ml="auto" mr="10px" className="play" />
  </Flex>
}

const AppUI = () => {
  return (
    <Wrapper flexDirection="column" px="30px">
      <Flex mt="25px" alignItems="center" justifyContent="space-between">
        <h1>Saturday<br />Morning Mix</h1>
        <div className="profile" style={{ width: 80, height: 80, backgroundColor: "#000", borderRadius: "50%" }} />
      </Flex>
      <Comment className="comment">Here are some tunes for you to start your morning. Mostly quiet and slow-beat, some of them are mood changer.</Comment>
      <Flex mt="20px" height="200px" style={{ overflowX: "auto" }}>
        <Album />
        <Album />
        <Album />
        <Album />
      </Flex>
      <Flex mt="25px" alignItems="flex-end" justifyContent="space-between">
        <h1 style={{ margin: 0 }}>Lauren is<br />listening</h1>
        <div className="playing" style={{ backgroundColor: "#CDC0FF", color: "#8465FF", padding: "3px 4px", borderRadius: 9 }}>NOW PLAYING</div>
      </Flex>
      <Flex mt="20px" mb="65px" flexDirection="column" style={{ overflowY: "auto" }}>
        <Music />
        <Music />
        <Music />
      </Flex>


      <BottomTab>
        <Icon name="home" />
        <Icon name="graph" />
        <Icon name="search" width={42} height={42} />
      </BottomTab>
    </Wrapper>
  )
}

export default AppUI

const BottomTab = styled(Flex)`
  position: absolute;
  width: 95%;
  height: 65px;
  bottom: 0;
  left: 2.5%;
  background-color: #fff;
  align-items: center;
  border-bottom-right-radius: 25%;
  border-bottom-left-radius: 25%;

  div {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    
    svg {
      width: 42px;
      height: 42px;

      @media (max-width: 768px) {
        width: 24px;
        height: 24px;
      }
    }
  }
`

const Wrapper = styled(Flex)`
 position: relative;
 width: 100%;
 height: 100%;
 background-color: #fff;
 border-radius: 10%;

`

const Comment = styled.span`
  color: #A4A4A4;
  font-size: 15px;
`