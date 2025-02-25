import React from "react";
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import { PreferencesStore } from "../../store";

export function ExperiementalPreferencesPage() {
  const pref = new PreferencesStore();

  return (
    <>
      <h5>Workspace preferences</h5>
      <FormGroup>
        <FormControlLabel
          control={
            <Checkbox
              defaultChecked={pref.load()?.debug}
              onChange={(e) => {
                pref.debug_mode(e.target.checked);
              }}
            />
          }
          label="debug_mode"
        />
        <FormControlLabel
          control={
            <Checkbox
              defaultChecked={
                pref.load()?.experimental.preview_feature_components_support ===
                "enabled"
              }
              onChange={(e) => {
                pref.enable_preview_feature_components_support(
                  e.target.checked ? "enabled" : "disabled"
                );
              }}
            />
          }
          label="enable_preview_feature_components_support"
        />
      </FormGroup>
    </>
  );
}
