"use client";

import { usePortalSessionTouch } from "./use-portal-session-touch";

export default function PortalSessionTouchBoundary({
  token,
}: {
  token: string;
}) {
  usePortalSessionTouch(token);
  return null;
}
