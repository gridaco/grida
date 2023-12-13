import styled from "@emotion/styled";
import React from "react";

function StatusBar() {
  return (
    <RootWrapperStatusBar>
      <Content>
        <Rectangle105></Rectangle105>
        <Left>
          <Item>
            <ItemBase>
              <Icon></Icon>
              <Text>main</Text>
            </ItemBase>
          </Item>
          <Item_0001>
            <ItemBase_0001>
              <Icon_0001></Icon_0001>
              <Text_0001>0↓ 1↑</Text_0001>
            </ItemBase_0001>
          </Item_0001>
        </Left>
        <Right></Right>
      </Content>
    </RootWrapperStatusBar>
  );
}

const RootWrapperStatusBar = styled.div`
  /* width: 1238px; */
  height: 22px;
  position: relative;
  align-self: stretch;
`;

const Content = styled.div`
  /* width: 1238px; */
  height: 22px;
  position: absolute;
  left: 0px;
  top: 0px;
`;

const Rectangle105 = styled.div`
  /* width: 1238px; */
  height: 22px;
  background-color: rgba(51, 51, 51, 1);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const Left = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 8px;
  width: 124px;
  height: 22px;
  box-sizing: border-box;
  position: absolute;
  left: 8px;
  top: calc((calc((50% + 0px)) - 11px));
`;

const Item = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 0;
  width: 54px;
  height: 22px;
  box-sizing: border-box;
`;

const ItemBase = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 4px;
  width: 54px;
  height: 22px;
  box-sizing: border-box;
  padding: 4px 4px;
`;

const Icon = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: codicon, sans-serif;
  font-weight: 400;
  text-align: left;
`;

const Text = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: "SF Pro Text", sans-serif;
  font-weight: 500;
  text-align: left;
`;

const Item_0001 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 0;
  width: 62px;
  height: 22px;
  box-sizing: border-box;
`;

const ItemBase_0001 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 4px;
  width: 62px;
  height: 22px;
  box-sizing: border-box;
  padding: 4px 4px;
`;

const Icon_0001 = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: codicon, sans-serif;
  font-weight: 400;
  text-align: left;
`;

const Text_0001 = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: "SF Pro Text", sans-serif;
  font-weight: 500;
  text-align: left;
`;

const Right = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 8px;
  width: 371px;
  height: 22px;
  box-sizing: border-box;
  position: absolute;
  top: calc((calc((50% + 0px)) - 11px));
  right: 8px;
`;

export default StatusBar;
