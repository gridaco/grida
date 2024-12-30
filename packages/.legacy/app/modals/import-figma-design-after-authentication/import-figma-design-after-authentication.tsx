import React, { useState } from "react";
import { Dialog, DialogContent } from "@editor-ui/dialog";
import { Button } from "@editor-ui/button";
import { setOauthToken } from "../../3rd-party-api/figma";
import { tunnel } from "@base-sdk-fp/auth";
import { linkedaccounts } from "@base-sdk-fp/accounts";
import { create } from "@editor-ui/dialog";
import { BrowserClient } from "@base-sdk-fp/core";
export const show_dialog_import_figma_design_after_authentication = create(
  ImportFigmaDesignAfterAuthentication_Modal
);

export function ImportFigmaDesignAfterAuthentication_Modal(props: {
  isOpen: boolean;
  onResolve: () => void;
  onReject: () => void;
}) {
  return (
    <>
      <Dialog open={props.isOpen}>
        <ImportFigmaDesignAfterAuthentication_Body
          onComplete={props.onResolve}
        />
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
export function ImportFigmaDesignAfterAuthentication_Body(props: {
  onComplete: () => void;
}) {
  const [procState, setProcState] =
    useState<AuthenticationProcessState>("initial");

  const content = () => {
    switch (procState) {
      case "initial":
        return (
          <InitialStateBody
            onNext={() => {
              setProcState("loading");
            }}
          />
        );
      case "loading":
        return (
          <LoadingStateBody
            onNext={props.onComplete}
            onCancel={() => {}}
            onError={() => {}}
          />
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

function InitialStateBody(props: { onNext: () => void }) {
  const onconnectclick = () => {
    // authenticate user
    const url = tunnel.makeurl.connect_figma();
    open(url);
    props.onNext();
  };

  return (
    <>
      <h3>Let's load the design by singin into Figma</h3>
      <p>
        It's your first time on Grida, you can load the design from figma via
        logging into figma once. :)
      </p>
      <Button id="trigger-figma-oauth-process" onClick={onconnectclick}>
        connect figma
      </Button>
    </>
  );
}

function LoadingStateBody(props: {
  onCancel: () => void;
  onNext: () => void;
  onError: () => void;
}) {
  const on__force_check_authentication_staus__click = async () => {
    // call get primary linked account request to grida auth server.
    const plfa = await new linkedaccounts.FigmaLinkedAccountsClient(
      new BrowserClient()
    ).getPrimaryLinked();
    plfa.accessToken;
    plfa.userId;
    plfa.expiresAt;

    // set the auth token to local storage (not secure)
    setOauthToken(plfa.accessToken);
    props.onNext();
    // then call the next function to load the design.
  };

  return (
    <>
      <h3>Complete your figma authentication</h3>
      <p>
        You need to complete "connect with figma" to complete importing your
        desing. Otherwise{" "}
        <a target="_blank" href="https://grida.co/docs/howto-import-design">
          Read this.
        </a>
        <br />
        Are you lost? -{" "}
        <a target="_blank" href={tunnel.makeurl.connect_figma()}>
          open link again
        </a>
      </p>
      <Button
        id={"force-check-authentication-staus"}
        onClick={on__force_check_authentication_staus__click}
      >
        I've done it. let's go
      </Button>
    </>
  );
}

function FailedStateBody() {
  const on__force_check_authentication_staus__click = () => {
    //
  };
  return (
    <>
      <h3>Failed to load design</h3>
      <p>
        We failed to load the design. Are you sure you've completed
        authentication?
      </p>
      <Button
        id={"re-force-check-authentication-staus"}
        onClick={on__force_check_authentication_staus__click}
      >
        Retry
      </Button>
    </>
  );
}
