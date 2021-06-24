import React, { useState } from "react";
import styled from "@emotion/styled";
import { TextField } from "@material-ui/core";
import { utils_figma } from "../../utils";

export default function AccessTokenConfigurationPage_Dev() {
  return (
    <_Root>
      <div>Figma:</div>
      <FigmaSection />

      <p>
        WARNING - we save this token on browser's localstorage. use it with your
        own caution. the source code manifesting this page can be found at
        <a href="https://github.com/bridgedxyz/design-to-code">github</a>
      </p>
    </_Root>
  );
}

function FigmaSection() {
  const initialToken = utils_figma.figmaPersonalAccessToken_safe();
  const [token, setToken] = useState(initialToken);

  // this get set by input later
  let tokenInput;

  const ExistingTokenDisplay = (props: { token: string }) => (
    <>
      Your figma token is set.{" "}
      <button
        onClick={() => {
          console.log(
            `🔐🔐🔐 token reveal requested by user 🔐🔐🔐 >>> "${token}"`
          );
        }}
      >
        click here to log your token to console
      </button>
      <button
        onClick={() => {
          utils_figma.clearToken();
          setToken(undefined);
        }}
      >
        clear value
      </button>
    </>
  );

  const NonSetTokenDisplay = () => {
    return (
      <>
        SET YOUR TOKEN HERE learn more at{" "}
        <a href="https://www.figma.com/developers/api">Figma's api guideline</a>
        <TextField
          label="personal access token"
          type="password"
          onChange={(e) => {
            tokenInput = e.target.value;
          }}
        />
        <button
          onClick={() => {
            utils_figma.setFigmaPersonalAccessToken_LocalDev(tokenInput);
            setToken(tokenInput);
          }}
        >
          update token value
        </button>
      </>
    );
  };

  return (
    <>
      {token ? <ExistingTokenDisplay token={token} /> : <NonSetTokenDisplay />}
    </>
  );
}

const _Root = styled.div`
  padding: 24px;
`;
