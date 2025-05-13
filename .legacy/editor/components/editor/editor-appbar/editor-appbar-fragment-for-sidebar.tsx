import React, { useCallback } from "react";
import styled from "@emotion/styled";
import { HamburgerMenuIcon, FigmaLogoIcon } from "@radix-ui/react-icons";
import { useRouter } from "next/router";
import { colors } from "theme";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "@editor-ui/dropdown-menu";
import { useEditorState } from "core/states";
import { useOpenPreferences } from "@code-editor/preferences";
import { openInFigma } from "@code-editor/external-links";
import { EditorAppbarModeCraftAddButton } from "./editor-appbar-mode-craft-add-button";

export function AppbarFragmentForSidebar() {
  const [state] = useEditorState();
  const router = useRouter();

  const handleOpenFile = useCallback(() => {
    openInFigma(state.design.key);
  }, [state?.design?.key]);

  const openPreferences = useOpenPreferences();

  return (
    <div className="flex justify-start items-center gap-2.5 self-stretch box-border p-3.5">
      <MenuButton
        onGoToHome={() => {
          router.push("/");
        }}
        onNewFile={() => {
          router.push("/import");
        }}
        onOpenInFigma={handleOpenFile}
        onOpenPreferences={openPreferences}
      />
      {state.mode.value === "craft" && (
        <div>
          <EditorAppbarModeCraftAddButton />
        </div>
      )}
    </div>
  );
}

function MenuButton({
  onGoToHome,
  onNewFile,
  onOpenInFigma,
  onOpenPreferences,
}: {
  onGoToHome?: () => void;
  onNewFile?: () => void;
  onOpenInFigma?: () => void;
  onOpenPreferences?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        style={{
          cursor: "pointer",
          outline: "none",
          border: "none",
          background: "transparent",
        }}
      >
        <HamburguerMenu />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={onGoToHome}>
          <DropdownMenuLabel>Go to Files</DropdownMenuLabel>
          <RightSlot>⌘Escape</RightSlot>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenPreferences}>
          <DropdownMenuLabel>Preferences</DropdownMenuLabel>
          <RightSlot>⌘,</RightSlot>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onNewFile}>
          <DropdownMenuLabel>New Project</DropdownMenuLabel>
        </DropdownMenuItem>
        {/* <DropdownMenuItem>
          <DropdownMenuLabel>Shortcuts</DropdownMenuLabel>
        </DropdownMenuItem> */}
        <DropdownMenuCheckboxItem checked onClick={onOpenInFigma}>
          <DropdownMenuItemIndicator>
            <FigmaLogoIcon color="black" />
          </DropdownMenuItemIndicator>
          <DropdownMenuLabel>Open in Figma</DropdownMenuLabel>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const RightSlot = styled.span`
  color: rgba(0, 0, 0, 0.5);
  margin-left: auto;
  padding-left: 20px;
`;

const HamburguerMenu = styled(HamburgerMenuIcon)`
  border-radius: 4px;
  padding: 8px;
  color: rgba(255, 255, 255, 0.5);

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
  }
`;

const RootWrapperAppbarFragmentForSidebar = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  align-self: stretch;
  background-color: ${colors.color_editor_bg_on_dark};
  box-sizing: border-box;
  padding: 14px 16px;
`;
