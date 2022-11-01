import React, { useCallback, useEffect, useState } from "react";
import { Client } from "@design-sdk/figma-remote-api";
import { useFigmaAuth } from "./use-figma-auth";
import { SetFigmaAuthAction, SetFigmaUserAction } from "core/actions";

export function WorkspaceFigmaAuthProvider({
  children,
  dispatch,
}: React.PropsWithChildren<{
  dispatch: (acrtion: SetFigmaAuthAction | SetFigmaUserAction) => void;
}>) {
  const { accessToken, personalAccessToken } = useFigmaAuth();

  const onAuthReady = useCallback(
    (authentication: {
      accessToken?: string;
      personalAccessToken?: string;
    }) => {
      dispatch({
        type: "set-figma-auth",
        authentication,
      });
    },
    [useCallback]
  );

  const onUserReady = useCallback(
    (user: { id: string; handle: string; img_url: string }) => {
      dispatch({
        type: "set-figma-user",
        user: {
          id: user.id,
          name: user.handle,
          profile: user.img_url,
        },
      });
    },
    [dispatch]
  );

  const onAuthProvided = () => {
    // once the auth is provided, fetch the figma user with the auth provided.
    Client({
      accessToken: accessToken.token,
      personalAccessToken: personalAccessToken,
    })
      .me()
      .then(({ data }) => {
        onUserReady(data);
      })
      .catch((e) => {
        throw e;
      });
  };

  useEffect(() => {
    if (personalAccessToken) {
      onAuthProvided();
      onAuthReady({
        personalAccessToken,
      });
    }

    if (accessToken.token) {
      onAuthProvided();
      onAuthReady({
        accessToken: accessToken.token,
      });
    }
  }, [accessToken.token, personalAccessToken]);

  return <>{children}</>;
}
