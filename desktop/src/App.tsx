import React from 'react';
import { AppRoot } from '@grida.co/app/app';
import { remote } from 'electron';
import styled from '@emotion/styled';

const DesktopAppRoot = styled.div`
  width: 100vw;
  height: 100vh;
`;

export default function App() {
  /**
   * https://github.com/electron/electron/issues/16385#issuecomment-453955377
   */
  const handleWindowDoubleClick = () => {
    const doubleClickAction = remote.systemPreferences.getUserDefault(
      'AppleActionOnDoubleClick',
      'string'
    );
    const win = remote.getCurrentWindow();
    if (doubleClickAction === 'Minimize') {
      win.minimize();
    } else if (doubleClickAction === 'Maximize') {
      if (!win.isMaximized()) {
        win.maximize();
      } else {
        win.unmaximize();
      }
    }
  };

  return (
    <DesktopAppRoot>
      <AppRoot mode="desktop" controlDoubleClick={handleWindowDoubleClick} />
    </DesktopAppRoot>
  );
}
