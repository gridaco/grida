import React from "react";
import styled from "@emotion/styled";
import { Chatwoot, ChatwootWidget } from "../chatwoot";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuArrow,
} from "@editor-ui/dropdown-menu";

export function GlobalHelpButton() {
  return (
    <>
      <ChatwootWidget show={false} />
      <HelpPosition>
        <HelpMenu
          onChatWithUs={() => {
            Chatwoot.toggle("open");
          }}
          onShowKeyboardShortcuts={() => {
            //
          }}
        >
          <HelpContainer>
            <HelpIcon />
          </HelpContainer>
        </HelpMenu>
      </HelpPosition>
    </>
  );
}

function HelpMenu({
  onChatWithUs,
  onShowKeyboardShortcuts,
  children,
}: {
  onChatWithUs;
  onShowKeyboardShortcuts;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        style={{
          border: "none",
          outline: "none",
          padding: 0,
          background: "none",
        }}
      >
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          onClick={() => {
            open("https://grida.co/docs/together/support/");
          }}
        >
          Help &amp; Support guide
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onChatWithUs}>
          Send us a message
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onShowKeyboardShortcuts}>
          Keyboard shortcuts
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            open("https://grida.co/join-slack");
          }}
        >
          Ask on Slack
        </DropdownMenuItem>
        <DropdownMenuArrow />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const HelpPosition = styled.div`
  position: fixed;
  bottom: 32px;
  right: 32px;
  z-index: 10;
`;

const HelpContainer = styled.div`
  width: 50px;
  height: 50px;
  background-color: white;
  border: solid 1px rgba(0, 0, 0, 0.1);
  border-radius: 50px;
  position: relative;
  box-shadow: 0px 4px 4px 0px rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.5);
  text-align: center;

  :hover {
    color: rgba(0, 0, 0, 1);
    border: solid 1px rgba(0, 0, 0, 0.2);
  }

  transition: all 0.2s ease-in-out;
`;

const HelpIcon = () => {
  return (
    <svg
      width="14"
      height="20"
      viewBox="0 0 14 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        marginLeft: "auto",
        marginRight: "auto",
        marginTop: "30%",
        display: "block",
      }}
    >
      <path
        d="M8.5625 19.375H5.4375V16.25H8.5625V19.375Z"
        fill="black"
        fillOpacity="0.5"
      />
      <path
        d="M0.75 6.875C0.75 3.42188 3.54688 0.625 7 0.625C10.4531 0.625 13.25 3.42188 13.25 6.875C13.25 10.7812 8.5625 11.1719 8.5625 14.6875H5.4375C5.4375 9.60938 10.125 10 10.125 6.875C10.125 5.15625 8.71875 3.75 7 3.75C5.28125 3.75 3.875 5.15625 3.875 6.875H0.75Z"
        fill="black"
        fillOpacity="0.5"
      />
    </svg>
  );
};
