import React from "react";
import Link from "next/link";
import styled from "@emotion/styled";

// import FormGroup from "@mui/material/FormGroup";
// import FormControlLabel from "@mui/material/FormControlLabel";
// import Checkbox from "@mui/material/Checkbox";
import { WorkspacePreferenceStore } from "store/workspace-preference-store";

export default function PreferencesHomePage() {
  const wsprefef = new WorkspacePreferenceStore();

  return (
    <_Root>
      <Link href="/preferences/access-tokens">
        Set Personal Access token for figma
      </Link>
      <br />
      <br />
      <br />
      <br />
      <h5>Workspace preferences</h5>
      {/* <FormGroup>
        <FormControlLabel
          control={
            <Checkbox
              defaultChecked={wsprefef.load()?.debug_mode}
              onChange={(e) => {
                wsprefef.debug_mode(e.target.checked);
              }}
            />
          }
          label="debug_mode"
        />
        <FormControlLabel
          control={
            <Checkbox
              defaultChecked={
                wsprefef.load()?.enable_preview_feature_components_support
              }
              onChange={(e) => {
                wsprefef.enable_preview_feature_components_support(
                  e.target.checked
                );
              }}
            />
          }
          label="enable_preview_feature_components_support"
        />
      </FormGroup> */}
    </_Root>
  );
}

const _Root = styled.div`
  padding: 24px;
  background-color: white;
`;
