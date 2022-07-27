import React, { useEffect } from "react";
import { RemoteImageRepositories } from "@design-sdk/figma-remote/lib/asset-repository/image-repository";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/core/assets-repository";
import { useEditorState } from "core/states";
import { useFigmaAccessToken } from "hooks";

/**
 * This is a queue handler of d2c requests.
 * Since the d2c can share cache and is a async process, we need this middleware wrapper to handle it elegantly.
 * @returns
 */
export function EditorImageRepositoryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state] = useEditorState();

  // listen to requests

  // handle requests, dispatch with results
  //

  const fat = useFigmaAccessToken();

  useEffect(() => {
    // ------------------------------------------------------------
    // other platforms are not supported yet
    // set image repo for figma platform
    if (state.design) {
      MainImageRepository.instance = new RemoteImageRepositories(
        state.design.key,
        {
          authentication: {
            personalAccessToken: fat.personalAccessToken,
            accessToken: fat.accessToken.token,
          },
        }
      );
      MainImageRepository.instance.register(
        new ImageRepository(
          "fill-later-assets",
          "grida://assets-reservation/images/"
        )
      );
    }
    // ------------------------------------------------------------
  }, [state.design?.key, fat.accessToken]);

  return <>{children}</>;
}
