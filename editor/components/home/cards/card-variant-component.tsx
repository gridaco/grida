import { useRouter } from "next/router";
import React from "react";
import { BaseHomeSceneCard } from "./base-home-scene-card";

export function ComponentCard({
  label,
  thumbnail,
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
