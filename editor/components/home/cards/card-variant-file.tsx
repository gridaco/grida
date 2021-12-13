import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { BaseHomeSceneCard } from "./base-home-scene-card";

export function FileCard({
  label,
  thumbnail,
  data,
}: {
  label: string;
  thumbnail: string;
  data: {
    file: string;
  };
}) {
  const router = useRouter();

  return (
    <BaseHomeSceneCard
      onClick={() => {
        router.push(`/files/[file]`, `/files/${data.file}`);
      }}
      label={label}
      thumbnail={thumbnail}
    />
  );
}
