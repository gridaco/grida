import type { FormEventMessagePayload } from "@/grida-forms/lib/messages";

export namespace FormAgentMessagingInterface {
  export function emit(payload: FormEventMessagePayload) {
    try {
      if (typeof window !== "undefined") {
        window.parent.postMessage(
          {
            namespace: "forms.grida.co",
            ...payload,
          },
          "*"
        );
      }
    } catch (e) {}
  }
}
