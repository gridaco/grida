import React from "react";
import { Grid } from "layouts/grid";
import SectionLayout from "layouts/section";

export default function GridLayoutExample() {
  return (
    <SectionLayout variant="content-default">
      <Grid start="5/8" end="8/8" marginTop="20px">
        <div style={{ width: "100%", height: 20, backgroundColor: "red" }} />
      </Grid>
      <Grid start="3/8" end="5/8" marginTop="20px">
        <div style={{ width: "100%", height: 20, backgroundColor: "red" }} />
      </Grid>
      <Grid start="1/8" end="5/8" marginTop="20px">
        <div style={{ width: "100%", height: 20, backgroundColor: "red" }} />
      </Grid>
    </SectionLayout>
  );
}
