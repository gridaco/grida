import { useFormAgentState } from "@/lib/formstate";
import { usePrevious } from "@uidotdev/usehooks";
import { useEffect } from "react";
import equal from "deep-equal";
import { emit } from "./emit";

export function FormAgentMessagingInterface() {
  const [state] = useFormAgentState();
  const prevRecord = usePrevious(state);

  useEffect(() => {
    if (!prevRecord) return;
    if (equal(prevRecord.fields, state.fields)) return;
    emit({
      type: "change",
      ...state,
    });
  }, [state]);

  return <></>;
}
