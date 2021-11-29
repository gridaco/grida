import styled from "@emotion/styled";
import React from "react";

export function DemoVSCode() {
  return (
    <RootWrapperDemo>
      <Tabs>
        <BaseVscodeTab>
          <LabelArea>
            <Icon
              src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/cecd/8d50/1f5569ac66c9ba6f70c1fb403ff58bfe"
              alt="icon"
            ></Icon>
            <Label>React.tsx</Label>
          </LabelArea>
        </BaseVscodeTab>
        <BaseVscodeTab_0001>
          <LabelArea_0001>
            <Icon_0001
              src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/cecd/8d50/1f5569ac66c9ba6f70c1fb403ff58bfe"
              alt="icon"
            ></Icon_0001>
            <Label_0001>Vue.vue</Label_0001>
          </LabelArea_0001>
        </BaseVscodeTab_0001>
        <BaseVscodeTab_0002>
          <LabelArea_0002>
            <Icon_0002
              src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/cecd/8d50/1f5569ac66c9ba6f70c1fb403ff58bfe"
              alt="icon"
            ></Icon_0002>
            <Label_0002>Flutter.dart</Label_0002>
          </LabelArea_0002>
        </BaseVscodeTab_0002>
        <BaseVscodeTab_0003>
          <LabelArea_0003>
            <Icon_0003
              src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/cecd/8d50/1f5569ac66c9ba6f70c1fb403ff58bfe"
              alt="icon"
            ></Icon_0003>
            <Label_0003>vanilla.html</Label_0003>
          </LabelArea_0003>
        </BaseVscodeTab_0003>
        <BaseVscodeTab_0004>
          <LabelArea_0004>
            <Icon_0004
              src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/cecd/8d50/1f5569ac66c9ba6f70c1fb403ff58bfe"
              alt="icon"
            ></Icon_0004>
            <Label_0004>module.css</Label_0004>
          </LabelArea_0004>
        </BaseVscodeTab_0004>
      </Tabs>
      <Lines>
        1<br />
        2<br />
        3<br />
        4<br />
        5<br />
        6<br />
        7<br />
        8<br />
        9<br />
        10
        <br />
        11
        <br />
        12
        <br />
        13
        <br />
        14
        <br />
        15
        <br />
        16
        <br />
        17
        <br />
        18
        <br />
        19
        <br />
        20
        <br />
        21
        <br />
        22
        <br />
        23
        <br />
        24
        <br />
        25
        <br />
        26
        <br />
        27
        <br />
        28
        <br />
        29
        <br />
        30
      </Lines>
    </RootWrapperDemo>
  );
}

const RootWrapperDemo = styled.div`
  background-color: rgba(30, 30, 30, 1);
  border-radius: 12px;
  position: relative;
  box-shadow: 0px 4px 24px rgba(0, 0, 0, 0.12);

  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;

  overflow: hidden;
`;

const Tabs = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  gap: 0;
  box-sizing: border-box;
  position: absolute;
  left: 0px;
  top: 0px;
  width: 600px;
  height: 36px;
`;

const BaseVscodeTab = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 116px;
  height: 36px;
  background-color: rgba(30, 30, 30, 1);
  box-sizing: border-box;
  padding: 14px 20px;
`;

const LabelArea = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  width: 76px;
  height: 16px;
  box-sizing: border-box;
`;

const Icon = styled.img`
  width: 14px;
  height: 14px;
  object-fit: cover;
`;

const Label = styled.span`
  color: rgba(236, 236, 236, 1);
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const BaseVscodeTab_0001 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 107px;
  height: 36px;
  background-color: rgba(30, 30, 30, 1);
  box-sizing: border-box;
  padding: 14px 20px;
`;

const LabelArea_0001 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  width: 67px;
  height: 16px;
  box-sizing: border-box;
`;

const Icon_0001 = styled.img`
  width: 14px;
  height: 14px;
  object-fit: cover;
`;

const Label_0001 = styled.span`
  color: rgba(141, 142, 144, 1);
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const BaseVscodeTab_0002 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 123px;
  height: 36px;
  background-color: rgba(30, 30, 30, 1);
  box-sizing: border-box;
  padding: 14px 20px;
`;

const LabelArea_0002 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  width: 83px;
  height: 16px;
  box-sizing: border-box;
`;

const Icon_0002 = styled.img`
  width: 14px;
  height: 14px;
  object-fit: cover;
`;

const Label_0002 = styled.span`
  color: rgba(141, 142, 144, 1);
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const BaseVscodeTab_0003 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 126px;
  height: 36px;
  background-color: rgba(30, 30, 30, 1);
  box-sizing: border-box;
  padding: 14px 20px;
`;

const LabelArea_0003 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  width: 86px;
  height: 16px;
  box-sizing: border-box;
`;

const Icon_0003 = styled.img`
  width: 14px;
  height: 14px;
  object-fit: cover;
`;

const Label_0003 = styled.span`
  color: rgba(141, 142, 144, 1);
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const BaseVscodeTab_0004 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 128px;
  height: 36px;
  background-color: rgba(30, 30, 30, 1);
  box-sizing: border-box;
  padding: 14px 20px;
`;

const LabelArea_0004 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  width: 88px;
  height: 16px;
  box-sizing: border-box;
`;

const Icon_0004 = styled.img`
  width: 14px;
  height: 14px;
  object-fit: cover;
`;

const Label_0004 = styled.span`
  color: rgba(141, 142, 144, 1);
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const Lines = styled.span`
  color: rgba(160, 161, 166, 1);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: Monaco, sans-serif;
  font-weight: 400;
  line-height: 24px;
  text-align: right;
  position: absolute;
  left: 37px;
  top: 63px;
`;
