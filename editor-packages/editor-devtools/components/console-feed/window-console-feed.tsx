import React, { useEffect, useState } from "react";
import { Console, Hook, Unhook } from "@code-editor/console-feed";

export function WindowConsoleFeed({ style }: { style?: React.CSSProperties }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    // run once
    Hook(
      window.console,
      (log) => setLogs((currLogs) => [...currLogs, log]),
      false
    );
    return () => {
      Unhook(window.console as any);
    };
  }, []);

  return (
    <div style={style}>
      <Console logs={logs} variant="dark" />
    </div>
  );
}
