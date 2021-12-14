import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { BaseHomeSceneCard } from "./base-home-scene-card";

export function FileCard({
  label,
  data,
}: {
  label: string;
  data: {
    key: string;
    thumbnailUrl: string;
  };
}) {
  const router = useRouter();

  return (
    <BaseHomeSceneCard
      onClick={() => {
        router.push(`/files/[key]`, `/files/${data.key}`);
      }}
      label={label}
      thumbnail={data.thumbnailUrl}
    />
  );
}
