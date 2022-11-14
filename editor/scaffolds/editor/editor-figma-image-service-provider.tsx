import { useDispatch } from "core/dispatch";
import { useWorkspaceState } from "core/states";
import React, { useCallback, useEffect, useMemo } from "react";
import { FigmaImageService } from "services";

type Fetcher = { fetch: FigmaImageService["fetch"] };
type FetcherParams = Parameters<Fetcher["fetch"]>;

export const FigmaImageServiceContext = React.createContext<Fetcher>(null);

export function FigmaImageServiceProvider({
  filekey,
  children,
}: React.PropsWithChildren<{
  filekey: string;
}>) {
  const wssate = useWorkspaceState();
  const dispatch = useDispatch();

  const service = useMemo(() => {
    if (!filekey || !wssate.figmaAuthentication) return;

    return new FigmaImageService(filekey, wssate.figmaAuthentication, null, 24);
  }, [filekey, wssate.figmaAuthentication]);

  const pushTask = useCallback(
    (key: string | string[]) =>
      dispatch({
        type: "editor-task-push",
        task: {
          id: `services.figma.fetch-image.${key}`,
          debounce: 1000,
          name: `Fetch image`,
          description: `Fetching image of ${
            Array.isArray(key) ? key.join(", ") : key
          }`,
          progress: null,
        },
      }),
    [dispatch]
  );

  const popTask = useCallback(
    (key: string | string[]) =>
      dispatch({
        type: "editor-task-pop",
        task: {
          id: `services.figma.fetch-image.${key}`,
        },
      }),
    [dispatch]
  );

  const fetcher = useMemo(() => {
    if (!service) return null;
    return {
      fetch: (...p: FetcherParams) => {
        const task = service.fetch(...p);
        pushTask(p[0]);
        task.finally(() => {
          popTask(p[0]);
        });
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
