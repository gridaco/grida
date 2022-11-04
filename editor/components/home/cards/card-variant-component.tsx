import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { BaseHomeSceneCard } from "./base-home-scene-card";
import { fetch } from "@design-sdk/figma-remote";
import { useFigmaAuth } from "scaffolds/workspace/figma-auth";

export function ComponentCard({
  label,
  thumbnail: initialThumbnail,
  data,
}: {
  label: string;
  thumbnail: string;
  data: {
    file: string;
    fileName: string;
    id: string;
  };
}) {
  const router = useRouter();

  const fat = useFigmaAuth();

  const [thumbnail, setThumbnail] = useState(initialThumbnail);

  useEffect(() => {
    if (fat) {
      if (!thumbnail) {
        fetch
          .fetchNodeAsImage(
            data.file,
            {
              personalAccessToken: fat.personalAccessToken,
              accessToken: fat.accessToken.token,
            },
            data.id
          )
          .then((url) => {
            setThumbnail(url.__default);
          });
      }
    }
  }, [fat]);

  return (
    <BaseHomeSceneCard
      onClick={() => {
        router.push("/files/[key]/[id]", `/files/${data.file}/${data.id}`);
      }}
      label={label}
      description={data.fileName}
      thumbnail={thumbnail}
    />
  );
}
