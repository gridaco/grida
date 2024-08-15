import { useFormAgentState } from "@/lib/formstate";
import { useCallback, useEffect, useState } from "react";

/**
 * A file media resolver provider.
 * this component will load attatched files (medias - audio / video) and emmit properties that are not available in the form state.
 * - duration
 */
export function MediaLoadProvider() {
  const [state, dispatch] = useFormAgentState();

  const onMediaFileMetaLoad = useCallback(
    (field_id: string, fileindex: number, metadata: { duration: number }) => {
      dispatch({
        type: "fields/files/metadata/change",
        id: field_id,
        index: fileindex,
        metadata,
      });
    },
    [dispatch]
  );

  return (
    <>
      {Object.keys(state.rawfiles).map((key) => {
        const files = state.rawfiles[key];
        return files.map((file, index) => {
          return (
            <MediaLoad
              key={index}
              file={file}
              onLoadedMetadata={(data) => {
                onMediaFileMetaLoad(key, index, data);
              }}
            />
          );
        });
      })}
    </>
  );
}

function MediaLoad({
  file,
  onLoadedMetadata,
}: {
  file: File;
  onLoadedMetadata: (data: { duration: number }) => void;
}) {
  const duration = useMediaDuration(file);

  useEffect(() => {
    if (duration) {
      onLoadedMetadata({ duration });
    }
  }, [duration]);

  return <></>;
}

function useMediaDuration(file: File) {
  const [duration, setDuration] = useState<number | undefined>(undefined);

  useEffect(() => {
    let mediaElement: HTMLMediaElement;
    const url = URL.createObjectURL(file);

    if (file.type.startsWith("audio/")) {
      mediaElement = new Audio();
    } else if (file.type.startsWith("video/")) {
      mediaElement = document.createElement("video");
    } else {
      console.warn("Unsupported media type");
      return;
    }

    mediaElement.src = url;

    mediaElement.onloadedmetadata = () => {
      setDuration(mediaElement.duration);
      URL.revokeObjectURL(url); // Clean up the URL after loading
    };

    return () => {
      URL.revokeObjectURL(url); // Clean up URL when component unmounts
    };
  }, [file]);

  return duration;
}
