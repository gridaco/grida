import { useFigmaAccessToken } from "hooks/use-figma-access-token";
import React, { useCallback, useEffect, useMemo } from "react";
import { FigmaImageService } from "services";

export const FigmaImageServiceContext =
  React.createContext<FigmaImageService>(null);

export function FigmaImageServiceProvider({
  filekey,
  children,
}: React.PropsWithChildren<{
  filekey: string;
}>) {
  const { personalAccessToken, accessToken } = useFigmaAccessToken();
  const service = useMemo(() => {
    if (!filekey || (!personalAccessToken && !accessToken)) return;

    return new FigmaImageService(filekey, {
      personalAccessToken: personalAccessToken,
      accessToken: accessToken.token,
    });
  }, [filekey, personalAccessToken, accessToken.token]);

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
