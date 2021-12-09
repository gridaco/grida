import React, { useEffect, useState } from "react";
import { SigninToContinueBannerPrmoptProvider } from "components/prompt-banner-signin-to-continue";
import { Editor } from "scaffolds/editor";

export default function Page() {
  return (
    <SigninToContinueBannerPrmoptProvider>
      <Editor />
    </SigninToContinueBannerPrmoptProvider>
  );
}
