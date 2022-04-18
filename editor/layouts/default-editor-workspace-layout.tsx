import styled from "@emotion/styled";
import React from "react";
import { Resizable } from "re-resizable";

type SidebarElementSignature =
  | JSX.Element
  | {
      _type: "resizable";
      children: JSX.Element;
      minWidth: number;
      maxWidth: number;
    };

export function DefaultEditorWorkspaceLayout(props: {
  leftbar?: SidebarElementSignature;
  rightbar?: SidebarElementSignature;
  /**
   * global area appbar
   */
  appbar?: JSX.Element;
  /**
   * content area appbar
   */
  contentAreaAppbar?: JSX.Element;
  children: JSX.Element | Array<JSX.Element>;
  display?: "none" | "initial"; // set to none when to hide.
  backgroundColor?: string;
}) {
  return (
    <WorkspaceRoot
      display={props.display}
      backgroundColor={props.backgroundColor}
    >
      <AppBarMenuAndBelowContentWrap>
        {props.appbar && <AppBarWrap>{props.appbar}</AppBarWrap>}
        <NonMenuContentZoneWrap>
          {props.leftbar && (
            <Sidebar position="left" signature={props.leftbar}></Sidebar>
          )}
          {props.contentAreaAppbar ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
              }}
            >
              {props.contentAreaAppbar}
              <ChildrenContainerRoot>{props.children}</ChildrenContainerRoot>
            </div>
          ) : (
            <ChildrenContainerRoot>{props.children}</ChildrenContainerRoot>
          )}
          {props.rightbar && (
            <Sidebar position="right" signature={props.rightbar}></Sidebar>
          )}
        </NonMenuContentZoneWrap>
      </AppBarMenuAndBelowContentWrap>
    </WorkspaceRoot>
  );
}

function Sidebar(
  p: { signature: SidebarElementSignature } & {
    position: "left" | "right";
  }
) {
  if ("_type" in p.signature) {
    switch (p.signature._type) {
      case "resizable": {
        return (
          <Resizable
            defaultSize={{
              width: p.signature.minWidth,
              height: "100%",
            }}
            style={{
              zIndex: 1,
              flexGrow: 0,
              minHeight: "100%",
              maxHeight: "100%",
              width: "100%",
              maxWidth: p.signature.maxWidth,
              minWidth: p.signature.minWidth,
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
            minWidth={p.signature.minWidth}
            maxWidth={p.signature.maxWidth}
            enable={{
              left: p.position === "right", // if position is right, then enable left
              right: p.position === "left", // if position is left, then enable right
              top: false,
              bottom: false,
            }}
          >
            {p.signature.children}
          </Resizable>
        );
      }
    }
  }

  return (
    <div
      style={{
        zIndex: 1,
        flexGrow: 0,
        minHeight: "100%",
        maxHeight: "100%",
        maxWidth: 400,
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {p.signature as JSX.Element}
    </div>
  );
}

const WorkspaceRoot = styled.div<{
  display?: "none" | "initial";
  backgroundColor: string;
}>`
  ${(props) => props.display && `display: ${props.display};`}
  overflow: hidden;
  width: 100vw;
  height: 100vh;
  background-color: ${(p) => p.backgroundColor ?? "transparent"};
`;

const AppBarMenuAndBelowContentWrap = styled.div`
  min-height: 100%;
  max-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const AppBarWrap = styled.div`
  flex-grow: 0;
`;

const NonMenuContentZoneWrap = styled.div`
  min-height: 100%;
  flex-grow: 1;
  display: flex;
  flex-direction: row;
  align-items: stretch;
`;

const ChildrenContainerRoot = styled.div`
  flex: 1;
  min-height: 100%;
`;
