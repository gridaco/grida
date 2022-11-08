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

export function AppbarFragmentForSidebar() {
  const [state] = useEditorState();
  const router = useRouter();

  const handleOpenFile = useCallback(() => {
    open(`https://www.figma.com/file/${state.design.key}`);
  }, [state?.design?.key]);

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
      />
    </RootWrapperAppbarFragmentForSidebar>
  );
}

function MenuButton({
  onGoToHome,
  onNewFile,
  onOpenInFigma,
}: {
  onGoToHome?: () => void;
  onNewFile?: () => void;
  onOpenInFigma?: () => void;
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
        <HamburgerMenuIcon color="white" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={onGoToHome}>
          <DropdownMenuLabel>Go to projects</DropdownMenuLabel>
        </DropdownMenuItem>
        {/* TODO: */}
        <DropdownMenuItem>
          <DropdownMenuLabel>Preferences</DropdownMenuLabel>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onNewFile}>
          <DropdownMenuLabel>New project</DropdownMenuLabel>
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

const RootWrapperAppbarFragmentForSidebar = styled.div`
  z-index: 10;
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
