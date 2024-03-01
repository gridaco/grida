import { AnalyticsBrowser } from "@segment/analytics-next";

const analytics = AnalyticsBrowser.load({
  writeKey: process.env.NEXT_PUBLIC_SEGMENT_WRITE_KEY!,
});

export function identify(userId: string, traits: any) {
  analytics.identify(userId, traits);
}

type SelectNodeEvent = {};
type TrackEvent = SelectNodeEvent;

export function track<K extends keyof TrackEventMap>(
  key: K,
  data: TrackEventMap[K]
) {
  if (!process.env.NEXT_PUBLIC_SEGMENT_WRITE_KEY) {
    return;
  }

  try {
    analytics.track(key, data);
  } catch (e) {}
}

interface TrackEventMap {
  "select-node": SelectNodeEvent;
}
