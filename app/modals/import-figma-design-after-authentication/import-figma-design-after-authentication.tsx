import React, { useState } from "react";
import { Dialog, DialogTrigger, DialogContent } from "@editor-ui/dialog";
import { Button } from "@editor-ui/button";
export function ImportFigmaDesignAfterAuthentication_Modal(props: {
  open?: boolean;
}) {
  return (
    <>
      <Dialog
        open={props.open}
        onPointerDownOutside={() => {} /* prevent close */}
      >
        <DialogTrigger>Dialog trigger</DialogTrigger>
        <ImportFigmaDesignAfterAuthentication_Body />
      </Dialog>
    </>
  );
}

type AuthenticationProcessState =
  | "initial"
  | "loading"
  | "complete"
  | "cancel"
  | "error";
export function ImportFigmaDesignAfterAuthentication_Body() {
  const [procState, setProcState] =
    useState<AuthenticationProcessState>("initial");

  const onconnectclick = () => {
    // authenticate user
    const url = makeurl();
    open(url);
    setProcState("loading");
  };

  const content = () => {
    switch (procState) {
      case "initial":
        return (
          <>
            <h3>Let's load the design by singin into Figma</h3>
            <p>
              It's your first time on Grida, you can load the design from figma
              via logging into figma once. :)
            </p>
            <Button id="trigger-figma-oauth-process" onClick={onconnectclick}>
              connect figma
            </Button>
          </>
        );
      case "loading":
        return (
          <>
            <h3>Complete your figma authentication</h3>
            <p>
              You need to complete "connect with figma" to complete importing
              your desing. Otherwise{" "}
              <a
                target="_blank"
                href="https://grida.co/docs/howto-import-desing"
              >
                Read this.
              </a>
              <br />
              Are you lost? -{" "}
              <a target="_blank" href={makeurl()}>
                open link again
              </a>
            </p>
            <Button id={"force-check-authentication-staus"}>
              I've done it. let's go
            </Button>
          </>
        );
    }
  };

  return (
    // @ts-ignore
    <DialogContent>
      <div>{content()}</div>
    </DialogContent>
  );
}

function makeurl(): string {
  const _host =
    process.env.NODE_ENV !== "production"
      ? "http://localhost:3302"
      : "https://accounts.grida.co";
  const url = `${_host}/tunnel?command=connect-figma`;
  return url;
}
