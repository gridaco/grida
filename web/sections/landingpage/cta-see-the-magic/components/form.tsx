import styled from "@emotion/styled";
import React from "react";

import { breakpoints } from "sections/landingpage/_breakpoints";
import { signup_callback_redirect_uri } from "utils/landingpage/constants";

import { MagicButton } from "./button";
import { MagicInput } from "./input";

export function MagicCtaForm() {
  const [value, setValue] = React.useState(null);

  const onsubmit = () => {
    window.open(
      `https://accounts.grida.co/signup?email=${value}&redirect_uri=${signup_callback_redirect_uri()}`,
    );
  };

  return (
    <FormArea>
      <MagicInput onChange={setValue} />
      <MagicButton onClick={onsubmit} />
    </FormArea>
  );
}

const FormArea = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 24px;
  align-self: stretch;
  box-sizing: border-box;

  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
  }
  @media ${breakpoints.md} {
  }
  @media ${breakpoints.sm} {
  }
  @media ${breakpoints.xs} {
    flex-direction: column;
  }
`;
