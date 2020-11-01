import firebase from "./firebase"

const LOG_CTA_GET_STARTED = "LOG_CTA_GET_STARTED"
export function logCtaGetStartedClick() {
    firebase.analytics().logEvent(LOG_CTA_GET_STARTED)
}