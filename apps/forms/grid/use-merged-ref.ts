import { Ref, useCallback } from "react";

const useMergedRef = <T>(...refs: (Ref<T> | undefined)[]): Ref<T> => {
  return useCallback(
    (node: T) => {
      refs.forEach((ref) => {
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<T | null>).current = node;
        }
      });
    },
    [refs]
  );
};

export default useMergedRef;
