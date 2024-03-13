import React from "react";
import * as Popover from "@radix-ui/react-popover";
import { useDispatch } from "core/dispatch";
import { useCallback, useState, useEffect } from "react";
import { ImageIcon } from "@radix-ui/react-icons";
import { useInspectorElement } from "hooks/use-inspector-element";
import {
  PropertyGroup,
  PropertyGroupHeader,
  PropertyLine,
  PropertyLines,
} from "@editor-ui/property";
import Image from "next/image";
import { RandomPhoto } from "@/lib/unsplash";

export function CraftImageSection() {
  const dispatch = useDispatch();
  const element = useInspectorElement();

  const onSrcChange = useCallback(
    (src: string) => {
      dispatch({
        type: "(craft)/node/src/data",
        data: src,
      });
    },
    [dispatch]
  );

  const onPhotoClick = useCallback(
    (photo: RandomPhoto) => {
      onSrcChange(photo.urls.regular);
    },
    [onSrcChange]
  );

  if (!element || element.tag !== "img") {
    return <></>;
  }

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Image</h6>
      </PropertyGroupHeader>
      <PropertyLines>
        <PropertyLine label="src">
          <Popover.Root>
            <Popover.Trigger>
              <button className="px-4 py-2 flex justify-center items-center gap-2 bg-transparent rounded border border-white/10">
                <ImageIcon />
              </button>
            </Popover.Trigger>
            <Popover.Content side="bottom" align="start" className="bg-black">
              <ImageExplorer onPhotoClick={onPhotoClick} />
            </Popover.Content>
          </Popover.Root>
        </PropertyLine>
      </PropertyLines>
    </PropertyGroup>
  );
}

const fetchUnsplashRandomPhotos = async () => {
  const response = await fetch("/api/unsplash");
  return response.json();
};

export function ImageExplorer({
  onPhotoClick,
}: {
  onPhotoClick?: (photo: RandomPhoto) => void;
}) {
  const [photos, setPhotos] = useState<RandomPhoto[]>([]);

  useEffect(() => {
    fetchUnsplashRandomPhotos().then((data) => {
      setPhotos(data);
    });
  }, []);

  return (
    <div className="rounded p-4 w-48 max-h-96 overflow-scroll gap-4 flex flex-wrap border border-white">
      {photos?.map((_, i) => (
        <button
          key={_.id}
          onClick={() => {
            onPhotoClick?.(_);
          }}
        >
          <Image
            className="select-none pointer-events-none"
            alt={_.alt_description ?? _.description ?? ""}
            src={_.urls.small}
            width={400}
            height={400}
          />
        </button>
      ))}
    </div>
  );
}
