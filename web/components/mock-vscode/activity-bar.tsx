import styled from "@emotion/styled";
import React from "react";

function ActivityBar() {
  return (
    <RootWrapperActivityBar>
      <Bottom>
        <Item>
          <Base>
            <Icon></Icon>
          </Base>
        </Item>
        <Item_0001>
          <Base_0001>
            <Icon_0001></Icon_0001>
          </Base_0001>
        </Item_0001>
      </Bottom>
      <Top>
        <Item_0002>
          <Base_0002>
            <Icon_0002></Icon_0002>
          </Base_0002>
        </Item_0002>
        <Item_0003>
          <Base_0003>
            <Icon_0003></Icon_0003>
          </Base_0003>
        </Item_0003>
        <Item_0004>
          <Base_0004>
            <Icon_0004></Icon_0004>
          </Base_0004>
        </Item_0004>
        <ActivityBarItemGrida>
          <Item_0005>
            <Base_0005>
              <ActiveBorder></ActiveBorder>
            </Base_0005>
          </Item_0005>
          <SideBarLogo>
            <LogoShapeOnly>
              <Union
                src="grida://assets-reservation/images/I7257:69155;257:21043;257:20984;1:25"
                alt="image of Union"
              ></Union>
              <Union_0001
                src="grida://assets-reservation/images/I7257:69155;257:21043;257:20984;1:28"
                alt="image of Union"
              ></Union_0001>
            </LogoShapeOnly>
          </SideBarLogo>
        </ActivityBarItemGrida>
      </Top>
    </RootWrapperActivityBar>
  );
}

const RootWrapperActivityBar = styled.div`
  width: 48px;
  height: 662px;
  background-color: rgba(51, 51, 51, 1);
  position: relative;
  align-self: stretch;
`;

const Bottom = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 0;
  width: 48px;
  height: 96px;
  box-sizing: border-box;
  position: absolute;
  left: calc((calc((50% + 0px)) - 24px));
  bottom: 0px;
`;

const Item = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 0;
  gap: 0;
  box-sizing: border-box;
`;

const Base = styled.div`
  width: 48px;
  height: 48px;
  position: relative;
`;

const Icon = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: codicon, sans-serif;
  font-weight: 400;
  text-align: center;
  position: absolute;
  left: calc((calc((50% + 0px)) - 12px));
  top: calc((calc((50% + 0px)) - 12px));
  opacity: 0.4;
`;

const Item_0001 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 0;
  gap: 0;
  box-sizing: border-box;
`;

const Base_0001 = styled.div`
  width: 48px;
  height: 48px;
  position: relative;
`;

const Icon_0001 = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: codicon, sans-serif;
  font-weight: 400;
  text-align: center;
  position: absolute;
  left: calc((calc((50% + 0px)) - 12px));
  top: calc((calc((50% + 0px)) - 12px));
  opacity: 0.4;
`;

const Top = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 0;
  height: 192px;
  box-sizing: border-box;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
`;

const Item_0002 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 0;
  gap: 0;
  box-sizing: border-box;
`;

const Base_0002 = styled.div`
  width: 48px;
  height: 48px;
  position: relative;
`;

const Icon_0002 = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: codicon, sans-serif;
  font-weight: 400;
  text-align: center;
  position: absolute;
  left: calc((calc((50% + 0px)) - 12px));
  top: calc((calc((50% + 0px)) - 12px));
  opacity: 0.4;
`;

const Item_0003 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 0;
  gap: 0;
  box-sizing: border-box;
`;

const Base_0003 = styled.div`
  width: 48px;
  height: 48px;
  position: relative;
`;

const Icon_0003 = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: codicon, sans-serif;
  font-weight: 400;
  text-align: center;
  position: absolute;
  left: calc((calc((50% + 0px)) - 12px));
  top: calc((calc((50% + 0px)) - 12px));
  opacity: 0.4;
`;

const Item_0004 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 0;
  gap: 0;
  box-sizing: border-box;
`;

const Base_0004 = styled.div`
  width: 48px;
  height: 48px;
  position: relative;
`;

const Icon_0004 = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: codicon, sans-serif;
  font-weight: 400;
  text-align: center;
  position: absolute;
  left: calc((calc((50% + 0px)) - 12px));
  top: calc((calc((50% + 0px)) - 12px));
  opacity: 0.4;
`;

const ActivityBarItemGrida = styled.div`
  width: 48px;
  height: 48px;
  position: relative;
`;

const Item_0005 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 0;
  gap: 0;
  box-sizing: border-box;
  position: absolute;
  left: 0px;
  top: 0px;
  width: 48px;
  height: 48px;
`;

const Base_0005 = styled.div`
  width: 48px;
  height: 48px;
  position: relative;
`;

const ActiveBorder = styled.div`
  width: 2px;
  background-color: rgba(255, 255, 255, 1);
  position: absolute;
  left: 0px;
  top: 0px;
  bottom: 0px;
`;

const SideBarLogo = styled.div`
  width: 21px;
  height: 21px;
  position: absolute;
  left: calc((calc((50% + 0px)) - 10px));
  top: calc((calc((50% + -0px)) - 11px));
`;

const LogoShapeOnly = styled.div`
  width: 21px;
  height: 21px;
  position: absolute;
  left: 0px;
  top: 0px;
`;

const Union = styled.img`
  width: 7px;
  height: 14px;
  object-fit: cover;
  position: absolute;
`;

const Union_0001 = styled.img`
  width: 13px;
  height: 21px;
  object-fit: cover;
  position: absolute;
`;

export default ActivityBar;
