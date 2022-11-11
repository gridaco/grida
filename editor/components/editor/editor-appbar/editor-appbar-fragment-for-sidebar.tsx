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
import { useDispatch as usePreferencesDispatch } from "@code-editor/preferences";

export function AppbarFragmentForSidebar() {
  const [state] = useEditorState();
  const router = useRouter();
  const preferencesDispatch = usePreferencesDispatch();

  const handleOpenFile = useCallback(() => {
    open(`https://www.figma.com/file/${state.design.key}`);
  }, [state?.design?.key]);

  const openPreferences = useCallback(() => {
    preferencesDispatch({ type: "open" });
  }, [preferencesDispatch]);

  return (
    <RootWrapperAppbarFragmentForSidebar>
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
    </RootWrapperAppbarFragmentForSidebar>
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
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenPreferences}>
          <DropdownMenuLabel>Preferences</DropdownMenuLabel>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onNewFile}>
          <DropdownMenuLabel>New Project</DropdownMenuLabel>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <DropdownMenuLabel>Shortcuts</DropdownMenuLabel>
        </DropdownMenuItem>
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
