import { firebase } from "../firebase";
import { LOG_CTA_GET_STARTED } from "./event-keys";

export function logCtaGetStartedClick() {
  safelyLogEvent(LOG_CTA_GET_STARTED);
}

export function safelyLogEvent(key: string, params?: { [key: string]: any }) {
  try {
    firebase.analytics().logEvent(key);
  } catch (_) {
    console.warn(_);
  }
}
