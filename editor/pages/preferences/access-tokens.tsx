import React, { useState } from "react";
import styled from "@emotion/styled";
import { TextField } from "@mui/material";
import { personal } from "@design-sdk/figma-auth-store";

export default function AccessTokenConfigurationPage_Dev() {
  return (
    <RootWrapperPreferencesAccessTokens>
      <Body>
        <HeadingArea>
          <Heading>Set up for Figma</Heading>
          <Description>
            Set your figma personal access token (pat) here.
          </Description>
        </HeadingArea>
        <FigmaSection />
      </Body>
      <Warning />
    </RootWrapperPreferencesAccessTokens>
  );
}

const Warning = () => {
  return (
    <WarningArea>
      <Divider></Divider>
      <WarningContentsLayout>
        <WarningBadge>
          <WarningBadgeText>WARNING</WarningBadgeText>
        </WarningBadge>
        <WarningContentText>
          We save this token on browser's localstorage. use it with your own
          caution. the source code manifesting this page can be found at{" "}
          <a href="https://github.com/bridgedxyz/design-to-code">github</a>
        </WarningContentText>
      </WarningContentsLayout>
    </WarningArea>
  );
};

const RootWrapperPreferencesAccessTokens = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: column;
  align-items: start;
  gap: 200px;
  background-color: white;
  box-sizing: border-box;
  min-height: 100vh;
  padding: 120px 100px 40px;
`;

const Body = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 63px;
  width: 492px;
  height: 356px;
  box-sizing: border-box;
`;

const HeadingArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
`;

const Heading = styled.span`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 48px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  text-align: left;
  align-self: stretch;
`;

const Description = styled.span`
  color: rgba(126, 126, 126, 1);
  text-overflow: ellipsis;
  font-size: 21px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
`;

const ModeNonSet = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 28px;
  width: 492px;
  height: 199px;
  box-sizing: border-box;
`;

const HowDoIGetOne = styled.span`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 21px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  text-align: left;
`;

const Guides = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 229px;
  height: 60px;
  box-sizing: border-box;
`;

const Gohere = styled.a`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 21px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
  text-decoration: underline;
`;

const Learnmore = styled.a`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 21px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
  text-decoration: underline;
`;

const Form = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 12px;
  width: 492px;
  height: 57px;
  box-sizing: border-box;
`;

const SaveButton = styled.div`
  cursor: pointer;
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 10px;
  border-radius: 4px;
  width: 87px;
  height: 57px;
  background-color: rgba(0, 0, 0, 1);
  box-sizing: border-box;
  padding: 16px 20px;

  :hover {
    opacity: 0.9;
  }
`;

const Save = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 21px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const WarningArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 18px;
  width: 420px;
  height: 123px;
  box-sizing: border-box;
`;

const Divider = styled.div`
  height: 0px;
  border: solid 1px rgba(238, 238, 238, 1);
  align-self: stretch;
`;

const WarningContentsLayout = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 30px;
  align-self: stretch;
  box-sizing: border-box;
`;

const WarningBadge = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 10px;
  border-radius: 4px;
  width: 97px;
  height: 40px;
  background-color: rgba(255, 199, 0, 1);
  box-sizing: border-box;
  padding: 10px 10px;
`;

const WarningBadgeText = styled.span`
  color: rgba(125, 125, 125, 1);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 500;
  text-align: left;
`;

const WarningContentText = styled.span`
  color: rgba(111, 111, 111, 1);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
  width: 293px;
`;

function FigmaSection() {
  const initialToken = personal.get_safe();
  const [token, setToken] = useState(initialToken);

  // this get set by input later
  let tokenInput;

  const ExistingTokenDisplay = (props: { token: string }) => (
    <ModeSet
      onClear={() => {
        personal.clear();
        setToken(undefined);
      }}
      onLogConsole={() => {
        console.log(
          `🔐🔐🔐 token reveal requested by user 🔐🔐🔐 >>> "${props.token}"`
        );
        alert("Logged. see the console");
      }}
    />
  );

  const NonSetTokenDisplay = () => {
    return (
      <>
        <ModeNonSet>
          <HowDoIGetOne>How do I get one?</HowDoIGetOne>
          <Guides>
            <Gohere
              href="https://www.figma.com/developers/api#access-tokens"
              target="_blank"
            >
              ➡ From Figma Api page
            </Gohere>
            <Learnmore
              href="https://www.grida.co/docs/with-figma/guides/how-to-get-personal-access-token"
              target="_blank"
            >
              (Learn how)
            </Learnmore>
          </Guides>
          <Form>
            <TextField
              fullWidth
              variant="filled"
              label="Enter your figma personal token here."
              type="password"
              onChange={(e) => {
                tokenInput = e.target.value;
              }}
            />
            <SaveButton
              onClick={() => {
                personal.set(tokenInput);
                setToken(tokenInput);
              }}
            >
              <Save>Save</Save>
            </SaveButton>
          </Form>
        </ModeNonSet>
      </>
    );
  };

  return (
    <>
      {token ? <ExistingTokenDisplay token={token} /> : <NonSetTokenDisplay />}
    </>
  );
}

function ModeSet({
  onClear,
  onLogConsole,
}: {
  onLogConsole: () => void;
  onClear: () => void;
}) {
  return (
    <RootWrapperModeSet>
      <YourFigmaTokenIsSet>Your figma token is set.</YourFigmaTokenIsSet>
      <NestedForm>
        <TokenInputObscure>
          <NaN>*************</NaN>
        </TokenInputObscure>
        <Buttons>
          <Log onClick={onLogConsole}>
            <LogToConsole>Log to console</LogToConsole>
          </Log>
          <Clear onClick={onClear}>
            <ClearValue>Clear value</ClearValue>
          </Clear>
        </Buttons>
      </NestedForm>
    </RootWrapperModeSet>
  );
}

const RootWrapperModeSet = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 25px;
  box-sizing: border-box;
`;

const YourFigmaTokenIsSet = styled.span`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 21px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  text-align: left;
`;

const TokenInputObscure = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 10px;
  border: solid 1px rgba(224, 224, 224, 1);
  border-radius: 4px;
  align-self: stretch;
  background-color: rgba(248, 248, 248, 1);
  box-sizing: border-box;
  padding: 16px 20px;
`;

const NaN = styled.span`
  color: rgba(180, 180, 180, 1);
  text-overflow: ellipsis;
  font-size: 21px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const Buttons = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 15px;
  align-self: stretch;
  box-sizing: border-box;
`;

const Log = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 10px;
  border-radius: 4px;
  width: 238px;
  height: 57px;
  background-color: rgba(0, 36, 129, 1);
  box-sizing: border-box;
  padding: 16px 20px;
`;

const LogToConsole = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 21px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const Clear = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 10px;
  border-radius: 4px;
  width: 238px;
  height: 57px;
  background-color: rgba(255, 46, 46, 1);
  box-sizing: border-box;
  padding: 16px 20px;
`;

const ClearValue = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 21px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const NestedForm = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 15px;
  width: 492px;
  height: 129px;
  box-sizing: border-box;
`;
