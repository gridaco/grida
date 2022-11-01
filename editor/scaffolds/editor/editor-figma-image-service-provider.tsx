import { useWorkspaceState } from "core/states";
import React, { useEffect, useMemo } from "react";
import { FigmaImageService } from "services";

export const FigmaImageServiceContext =
  React.createContext<FigmaImageService>(null);

export function FigmaImageServiceProvider({
  filekey,
  children,
}: React.PropsWithChildren<{
  filekey: string;
}>) {
  const wssate = useWorkspaceState();
  console.log("wssate.figmaAuthentication", wssate.figmaAuthentication);
  const service = useMemo(() => {
    if (!filekey || !wssate.figmaAuthentication) return;

    return new FigmaImageService(filekey, wssate.figmaAuthentication);
  }, [filekey, wssate.figmaAuthentication]);

  useEffect(() => {
    if (service) {
      service.warmup();
    }
  }, [service]);

  return (
    <FigmaImageServiceContext.Provider value={service}>
      {children}
    </FigmaImageServiceContext.Provider>
  );
}

export function useFigmaImageService() {
  return React.useContext(FigmaImageServiceContext);
}
