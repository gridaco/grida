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
  const service = useMemo(() => {
    if (!filekey) return;

    return new FigmaImageService(filekey, wssate.figmaAuthentication);
  }, [filekey]);

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
