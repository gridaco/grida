import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { LastUsedFileDisplay } from "repository/workspace-repository";
import { BaseHomeSceneCard } from "./base-home-scene-card";

export function FileCard({
  label,
  data,
  onClick,
}: {
  data: {
    type: "file";
    lastUsed?: Date;
    key: string;
    name: string;
    thumbnailUrl: string;
  };
  label?: string;
  onClick?: () => void;
}) {
  const router = useRouter();
  return (
    <BaseHomeSceneCard
      onClick={
        onClick ??
        (() => {
          router.push(`/files/[key]`, `/files/${data.key}`);
        })
      }
      label={label ?? data.name}
      thumbnail={data.thumbnailUrl}
    />
  );
}
