import React, { useEffect, useState } from "react";
import { Console, Hook, Unhook } from "console-feed";

export function ConsoleFeed() {
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

  return <Console logs={logs} variant="dark" />;
}
