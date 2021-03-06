import React from "react";
import styled from "@emotion/styled";

const LofiContent = () => {
  return (
    <LofiContainer>
      <LofiBox />
      <span>Morning Slowbeats - LoFi</span>
    </LofiContainer>
  );
};

const MusicCard = () => {
  return <MusicCradContainer></MusicCradContainer>;
};

const AppUi = () => {
  return (
    <div className="app-ui">
      <BoldText>
        Saturday <br /> Morning Mix
      </BoldText>
      <UserPicture />
      <Comments>
        Here are some tunes for you to start your morning. <br />
        Mostly quiet and slow-beat, some of them are mood <br />
        changer.
      </Comments>
      <LofiSlide>
        <LofiContent />
        <LofiContent />
        <LofiContent />
      </LofiSlide>
      {/* space */}
      <ListeningText>
        Lauren is <br /> listening
      </ListeningText>
      <NPBox>NOW PLAYING</NPBox>
      <MusicSlide>
        <MusicCard />
        <MusicCard />
        <MusicCard />
      </MusicSlide>
    </div>
  );
};

export default AppUi;

const BoldText = styled.div`
  width: fit-content;
  height: fit-content;
  font-size: 36px;
  font-weight: bold;
  position: absolute;
  top: 64px;
  left: 28px;
`;

const UserPicture = styled.div`
  width: 48px;
  height: 48px;
  background-color: gray;
  border-radius: 50%;
  position: absolute;
  top: 64px;
  right: 32px;
`;

const Comments = styled.div`
  position: absolute;
  top: 144px;
  left: 28px;
  font-size: 14px;
  color: #a4a4a4;
  font-family: Roboto;
  letter-spacing: -1.5% !important;
`;

const LofiContainer = styled.div`
  font-size: 14px;
  color: #a4a4a4;
  letter-spacing: -1.5% !important;
`;

const LofiSlide = styled.div`
  width: 350px;
  height: 100px;
  display: flex;
  justify-content: space-between;
  position: absolute;
  top: 216px;
  left: 28px;
`;

const LofiBox = styled.div`
  width: 108px;
  height: 100px;
  background-color: #000000;
`;

const ListeningText = styled.div`
  font-size: 24px;
  font-weight: bold;
  position: absolute;
  top: 388px;
  left: 28px;
`;

const NPBox = styled.button`
  height: 17px;
  width: 73px;
  position: absolute;
  top: 427px;
  right: 32px;
  border: 0;
  border-radius: 4px;
  padding: 4px;
  background: #cdc0ff;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  padding: 4px;
  font-size: 10px;
  color: #8465ff;
  letter-spacing: -1.5% !important;
`;

const MusicSlide = styled.div`
  position: absolute;
  top: 459px;
  left: 28px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: fit-content;
  height: 220px;
`;

const MusicCradContainer = styled.div`
  width: 232px;
  height: 66px;
  background-color: #aa0000;
  border-radius: 4px;
`;
