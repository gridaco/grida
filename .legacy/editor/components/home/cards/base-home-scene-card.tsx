import React from "react";
import styled from "@emotion/styled";
import { colors } from "theme";

export function BaseHomeSceneCard({
  label,
  description,
  onClick,
  thumbnail,
  labelIcon,
}: {
  label: string;
  description?: string;
  onClick?: () => void;
  thumbnail: string;
  labelIcon?: React.ReactElement;
}) {
  return (
    <RootWrapperBaseHomeSceneCard onClick={onClick}>
      <Body>
        <ThumbnailArea>
          <SceneCardPreviewThumbnail>
            {thumbnail && <ThumbnailImage src={thumbnail}></ThumbnailImage>}
          </SceneCardPreviewThumbnail>
        </ThumbnailArea>
        <ContentArea>
          <LabelDescContainer>
            <LabelArea>
              {labelIcon && <LabelIcon>{labelIcon}</LabelIcon>}
              <ThisLabel>{label}</ThisLabel>
            </LabelArea>
            {description && <Description>{description}</Description>}
          </LabelDescContainer>
        </ContentArea>
      </Body>
    </RootWrapperBaseHomeSceneCard>
  );
}

const RootWrapperBaseHomeSceneCard = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  border: solid 1px rgba(72, 72, 72, 1);
  border-radius: 2px;
  background-color: ${colors.color_editor_bg_on_dark};
  box-sizing: border-box;

  :hover {
    box-shadow: 0px 4px 16px 0px rgba(0, 0, 0, 0.25);
    border: solid 1px rgba(72, 72, 72, 1);
  }
`;

const Body = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 3px;
  align-self: stretch;
  box-sizing: border-box;
`;

const ThumbnailArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
`;

const SceneCardPreviewThumbnail = styled.div`
  height: 101px;
  background-color: #c1c1c1;
  position: relative;
  align-self: stretch;
`;

const ThumbnailImage = styled.img`
  object-fit: cover;
  width: 100%;
  width: -webkit-fill-available; /* Safari */
  height: 100%;
  flex-shrink: 0;
  -webkit-flex-shrink: 0;
`;

const ContentArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
  padding: 10px 10px;
`;

const LabelDescContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 221px;
  box-sizing: border-box;
`;

const LabelArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  align-self: stretch;
  box-sizing: border-box;
`;

const LabelIcon = styled.img`
  width: 16px;
  height: 16px;
`;

const ThisLabel = styled.span`
  color: rgba(212, 212, 212, 1);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  -webkit-line-clamp: 1;
  line-clamp: 1;
`;

const Description = styled.span`
  color: rgba(152, 152, 152, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
`;
