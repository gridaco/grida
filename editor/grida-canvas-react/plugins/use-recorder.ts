import * as React from "react";
import { Editor } from "@/grida-canvas/editor";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/shim/with-selector";
import { EditorRecorder } from "@/grida-canvas/plugins/recorder";
import deepEqual from "fast-deep-equal/es6/react.js";

export function useRecorder(editor: Editor) {
  const [recorder] = React.useState(new EditorRecorder(editor));

  const state = useSyncExternalStoreWithSelector(
    recorder.subscribe.bind(recorder),
    recorder.snapshot.bind(recorder),
    recorder.snapshot.bind(recorder),
    (s) => s,
    deepEqual
  );

  return React.useMemo(
    () => ({
      status: state.status,
      nframes: state.nframes,
      start: () => recorder.start(),
      stop: () => recorder.stop(),
      clear: () => recorder.clear(),
      replay: () => recorder.play(),
      exit: () => recorder.exit(),
      dumps: () => recorder.dumps(),
    }),
    [state, recorder]
  );
}
