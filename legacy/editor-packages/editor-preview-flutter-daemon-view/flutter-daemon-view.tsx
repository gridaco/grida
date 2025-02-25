import React, { useEffect, useState } from "react";
import Client, { FlutterProject } from "@flutter-daemon/client";

/**
 * cached client
 */
let _clinet: Client;
function useClinet() {
  const [client, setClient] = useState<Client>(_clinet);
  useEffect(() => {
    if (!_clinet) {
      _clinet = new Client("ws://localhost:43070");
      setClient(_clinet);
    }
  }, []);

  return client;
}

/**
 * cached project
 */
let _project: FlutterProject;
function useMainProject(initial?: string) {
  const client = useClinet();
  const [project, setProject] = useState<FlutterProject>(_project);
  useEffect(() => {
    if (!client) return;
    if (!_project) {
      client
        .project("tmp", "tmp", {
          "lib/main.dart": initial,
        })
        .then((project) => {
          _project = project;
          setProject(_project);
        });
    }
  }, [client]);
  return project;
}

/**
 * A flutter render view uses `@flutter-daemon/client` with present `@flutter-daemon/server` connection.
 * @returns
 */
export function SingleFileMainFlutterDaemonView({
  src,
  loading,
}: {
  src: string;
  loading?: JSX.Element;
}) {
  const project = useMainProject(src);
  const [booted, setBooted] = useState(false);
  const [weblaunchUrl, setWeblaunchUrl] = useState<string>();

  const [refreshKey, setRefreshKey] = useState<number>(0);

  useEffect(() => {
    if (project) {
      project.webLaunchUrl().then((url) => {
        setBooted(true);
        setWeblaunchUrl(url);
      });
    }
  }, [project]);

  useEffect(() => {
    console.log("src changed");
    if (project) {
      console.log("writing file...");
      project
        .writeFile("lib/main.dart", src, true)
        .then(() => {
          console.log("file written");
          setRefreshKey(refreshKey + 1);
        })
        .catch(console.error);
      // project.restart().then(() => {});
    }
  }, [src]);

  if (booted) {
    return (
      <iframe
        key={refreshKey}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
        }}
        src={weblaunchUrl}
      />
    );
  } else {
    return loading ?? <></>;
  }
}
