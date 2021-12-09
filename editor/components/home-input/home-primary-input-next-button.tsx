import React from "react";
import styled from "@emotion/styled";

export function HomePrimaryInputNextButton({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  if (disabled) {
    return <DisabledTrueThemeDark />;
  }
  return <DisabledFalseThemeDark />;
}

function DisabledFalseThemeDark() {
  return (
    <RootWrapperDisabledFalseThemeDark
      src="grida://assets-reservation/images/734:9050"
      alt="icon"
    ></RootWrapperDisabledFalseThemeDark>
  );
}

const RootWrapperDisabledFalseThemeDark = styled.img`
  width: 24px;
  height: 24px;
  object-fit: cover;
`;

function DisabledTrueThemeDark() {
  return (
    <RootWrapperDisabledTrueThemeDark
      src="grida://assets-reservation/images/734:9046"
      alt="icon"
    ></RootWrapperDisabledTrueThemeDark>
  );
}

const RootWrapperDisabledTrueThemeDark = styled.img`
  width: 24px;
  height: 24px;
  object-fit: cover;
`;
