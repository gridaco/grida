import { firebase } from "../firebase";
import { LOG_CTA_GET_STARTED } from "./event-keys";

export function logCtaGetStartedClick() {
  firebase.analytics().logEvent(LOG_CTA_GET_STARTED);
}
