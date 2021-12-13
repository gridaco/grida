import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { BaseHomeSceneCard } from "./base-home-scene-card";
import { fetch } from "@design-sdk/figma-remote";
import { useFigmaAccessToken } from "hooks/use-figma-access-token";

export function ComponentCard({
  label,
  thumbnail: initialThumbnail,
  data,
}: {
  label: string;
  thumbnail: string;
  data: {
    file: string;
    id: string;
  };
}) {
  const router = useRouter();

  const fat = useFigmaAccessToken();

  const [thumbnail, setThumbnail] = useState(initialThumbnail);

  useEffect(() => {
    if (fat) {
      if (!thumbnail) {
        fetch.fetchNodeAsImage(data.file, fat, data.id).then((url) => {
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
      thumbnail={thumbnail}
    />
  );
}
