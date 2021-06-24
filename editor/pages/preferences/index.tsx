import React from "react";
import Link from "next/link";
import styled from "@emotion/styled";
export default function PreferencesHomePage() {
  return (
    <_Root>
      <Link href="/preferences/access-tokens">
        Set Personal Access token for figma
      </Link>
    </_Root>
  );
}

const _Root = styled.div`
  padding: 24px;
`;
