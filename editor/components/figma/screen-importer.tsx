import React from "react";
import * as FigmaApi from "figma-js";
import { TextField } from "@material-ui/core";

export function FigmaScreenImporter() {
  return (
    <>
      <p>
        WARNING - we save this token on browser's index db. use it with your own
        caution. the source code manifesting this page can be found at
        <a href="https://github.com/bridgedxyz/design-to-code">github</a>
      </p>
      <TextField label={"access-token"} />
    </>
  );
}
