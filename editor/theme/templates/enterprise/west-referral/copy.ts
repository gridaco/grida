/**
 * Shared copy for west-referral campaign viewer (schedule messages, etc.).
 * Single source for tenant/referrer/invitation and portal card.
 */

export type CampaignCopyLocale = "en" | "ko";

const campaignScheduleCopy: Record<
  CampaignCopyLocale,
  { schedule_not_started: string; schedule_ended: string }
> = {
  en: {
    schedule_not_started: "This campaign has not started yet.",
    schedule_ended: "This campaign has ended.",
  },
  ko: {
    schedule_not_started: "아직 시작 전인 캠페인입니다.",
    schedule_ended: "종료된 캠페인입니다.",
  },
};

export function getCampaignScheduleCopy(
  locale: CampaignCopyLocale,
  key: "schedule_not_started" | "schedule_ended"
): string {
  return campaignScheduleCopy[locale]?.[key] ?? campaignScheduleCopy.en[key];
}

export { campaignScheduleCopy };

/** Campaign shape used for schedule check (open/close at, enabled). */
export type CampaignScheduleInput = {
  enabled?: boolean;
  scheduling_open_at: string | null;
  scheduling_close_at: string | null;
};

export type CampaignScheduleState = {
  isActive: boolean;
  hasStarted: boolean;
  hasEnded: boolean;
};

/**
 * Campaign-scoped schedule check. When both open/close are null or empty,
 * treats as "no schedule" = active. Uses same semantics as getCampaignScheduleMessage.
 */
export function isCampaignInSchedule(
  campaign: CampaignScheduleInput,
  now: Date = new Date()
): CampaignScheduleState {
  if (campaign.enabled === false) {
    return { isActive: false, hasStarted: false, hasEnded: true };
  }
  const openRaw = campaign.scheduling_open_at?.trim() || null;
  const closeRaw = campaign.scheduling_close_at?.trim() || null;
  if (!openRaw && !closeRaw) {
    return { isActive: true, hasStarted: true, hasEnded: false };
  }
  const startDate = openRaw ? new Date(openRaw) : null;
  const endDate = closeRaw ? new Date(closeRaw) : null;
  const hasStarted = startDate ? now >= startDate : true;
  const hasEnded = endDate ? now > endDate : false;
  const isActive = hasStarted && !hasEnded && (endDate ? now <= endDate : true);
  return { isActive, hasStarted, hasEnded };
}

/**
 * Returns a localized system message when the campaign is outside its schedule
 * (or disabled). When in range and enabled, returns null (CTA allowed).
 * When both open/close are null or empty, treats as "no schedule" = in range.
 */
export function getCampaignScheduleMessage(
  campaign: CampaignScheduleInput,
  locale: CampaignCopyLocale,
  now: Date = new Date()
): string | null {
  if (campaign.enabled === false) {
    return getCampaignScheduleCopy(locale, "schedule_ended");
  }
  const openRaw = campaign.scheduling_open_at?.trim() || null;
  const closeRaw = campaign.scheduling_close_at?.trim() || null;
  if (!openRaw && !closeRaw) {
    return null;
  }
  const openAt = openRaw ? new Date(openRaw) : null;
  const closeAt = closeRaw ? new Date(closeRaw) : null;
  if (openAt && isNaN(openAt.getTime())) return null;
  if (closeAt && isNaN(closeAt.getTime())) return null;
  const afterOpen = openAt ? now >= openAt : true;
  const beforeClose = closeAt ? now <= closeAt : true;
  if (afterOpen && beforeClose) return null;
  if (!afterOpen)
    return getCampaignScheduleCopy(locale, "schedule_not_started");
  return getCampaignScheduleCopy(locale, "schedule_ended");
}
