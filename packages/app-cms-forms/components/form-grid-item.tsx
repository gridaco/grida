import React from "react";
import styled from "@emotion/styled";

export function FormGridItemCard({
  name,
  responses = 0,
  onClick,
}: {
  name: string;
  responses?: number | string;
  onClick?: () => void;
}) {
  const [hover, setHover] = React.useState(false);

  return (
    <Container
      onClick={onClick}
      onMouseEnter={() => {
        setHover(true);
      }}
      onMouseLeave={() => {
        setHover(false);
      }}
    >
      <Body hover={hover}>
        <ThumbnailContainer background={"white"}>
          <Name>{name}</Name>
        </ThumbnailContainer>
        <Info>
          <Icons
            src="grida://assets-reservation/images/1065:88438"
            alt="icon"
          />
          <ResponseCount>
            {responses === 0
              ? "No responses"
              : typeof responses === "string"
              ? responses
              : `${responses} Responses`}
          </ResponseCount>
        </Info>
      </Body>
      <HoverOverlay opacity={hover ? 1 : 0}>
        <MoreMenu
          src="grida://assets-reservation/images/1065:88481"
          alt="icon"
        />
      </HoverOverlay>
    </Container>
  );
}

const Container = styled.div`
  cursor: pointer;
  min-height: 200px;
  min-width: 200px;
  border-radius: 4px;
  position: relative;
  box-shadow: 0px 4px 8px 0px rgba(0, 0, 0, 0.05);
`;

const Body = styled.div<{ hover: boolean }>`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: flex-start;
  flex: none;
  background-color: ${(props) =>
    props.hover ? "rgba(0, 0, 0, 0.05)" : "transparent"};
  transition: background-color 0.2s ease-in-out;
  box-sizing: border-box;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const ThumbnailContainer = styled.div<{
  background: React.CSSProperties["background"];
}>`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: 1;
  align-self: stretch;
  height: 183px;
  box-sizing: border-box;
  flex-shrink: 0;
  background: ${(props) => props.background};
`;

const Name = styled.span`
  color: black;
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: Inter, sans-serif;
  font-weight: 400;
  text-align: left;
`;

const Info = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  align-self: stretch;
  box-sizing: border-box;
  padding: 20px;
  flex-shrink: 0;
`;

const Icons = styled.img`
  width: 18px;
  height: 18px;
  object-fit: cover;
`;

const ResponseCount = styled.span`
  color: black;
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Inter, sans-serif;
  font-weight: 400;
  text-align: left;
`;

const HoverOverlay = styled.div<{ opacity: number }>`
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
  opacity: ${(props) => props.opacity};
  transition: opacity 0.2s ease-in-out;
`;

const MoreMenu = styled.img`
  width: 38px;
  height: 38px;
  object-fit: cover;
  position: absolute;
  top: 10px;
  right: 10px;
`;
