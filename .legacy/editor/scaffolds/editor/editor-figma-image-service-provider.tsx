import { WorkspaceState, useWorkspace, useWorkspaceState } from "core/states";
import React, { useEffect, useMemo } from "react";
import { FigmaImageService, ImageClientInterface } from "services";

type Fetcher = { fetch: FigmaImageService["fetch"] };
type FetcherParams = Parameters<Fetcher["fetch"]>;
type ApiClientResolver = ({
  filekey,
  authentication,
}: {
  filekey: string;
  authentication?: WorkspaceState["figmaAuthentication"];
}) => ImageClientInterface | undefined | "reject";

export const FigmaImageServiceContext = React.createContext<Fetcher>(null);

export function FigmaImageServiceProvider({
  filekey,
  children,
  resolveApiClient,
}: React.PropsWithChildren<{
  resolveApiClient: ApiClientResolver;
  filekey: string;
}>) {
  const wssate = useWorkspaceState();
  const { pushTask, popTask } = useWorkspace();

  const service = useMemo(() => {
    const client = resolveApiClient({
      filekey: filekey,
      authentication: wssate.figmaAuthentication,
    });

    if (client === "reject" || !client) {
      // do not create service without valid client.
      return;
    }

    return new FigmaImageService(filekey, client, null, 24);
  }, [filekey, wssate.figmaAuthentication]);

  const fetcher = useMemo(() => {
    if (!service) return null;
    return {
      fetch: (...p: FetcherParams) => {
        const task = service.fetch(...p);
        const key = p[0];

        // region push task to display queue with debounce
        // debounce 500 ms.
        // after 500 ms, if the task is not finished, push to the task queue for display.

        let timer: number;
        const start = () => {
          timer = window.setTimeout(() => {
            pushTask({
              id: `services.figma.fetch-image.${key}`,
              debounce: 1000,
              name: `Fetch image`,
              description: `Fetching image of ${
                Array.isArray(key) ? key.join(", ") : key
              }`,
              progress: null,
            });
          }, 500);
        };

        const stop = () => {
          window.clearTimeout(timer);
        };

        task.finally(() => {
          stop();
          const key = p[0];
          popTask({
            id: `services.figma.fetch-image.${key}`,
          });
        });

        start();
        // endregion

        return task;
      },
    };
  }, [service]);

  useEffect(() => {
    if (service) {
      service.warmup();
    }
  }, [service]);

  return (
    <FigmaImageServiceContext.Provider value={fetcher}>
      {children}
    </FigmaImageServiceContext.Provider>
  );
}

export function useFigmaImageService() {
  return React.useContext(FigmaImageServiceContext);
}
