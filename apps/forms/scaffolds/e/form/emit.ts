import type { FormEventMessagePayload } from "@/lib/forms/messages";
const ISDEV = process.env.NODE_ENV === "development";

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
