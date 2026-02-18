"use client";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Platform } from "@/lib/platform";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import {
  getCampaignScheduleMessage,
  isCampaignInSchedule,
  type CampaignCopyLocale,
} from "@/theme/templates/enterprise/west-referral/copy";

interface CardProps {
  campaign: Platform.WEST.Referral.CampaignPublic;
  referrer: {
    invitation_count: number;
  };
  locale?: CampaignCopyLocale;
}

const dictionary = {
  ko: {
    soon: "곧 시작됩니다",
    ended: "종료된 이벤트",
    go: "친구 초대하고 선물받기",
    upcoming: "진행예정",
    progress: "초대 현황",
    status: { active: "진행중", upcoming: "오픈 예정", closed: "종료됨" },
  },
  en: {
    soon: "Coming Soon",
    ended: "Ended",
    go: "Invite Friends & Earn Rewards",
    upcoming: "Upcoming",
    progress: "Your Invitations",
    status: { active: "Active", upcoming: "Upcoming", closed: "Closed" },
  },
};

const status_map = {
  active: "Active",
  upcoming: "Upcoming",
  closed: "Closed",
};

export default function CampaignReferrerCard({
  campaign,
  referrer,
  locale = "en",
}: CardProps) {
  const { max_invitations_per_referrer: max_invitation } = campaign;
  const { invitation_count } = referrer;

  const progress = max_invitation ? invitation_count / max_invitation : null;
  const now = new Date();
  const { isActive, hasEnded } = isCampaignInSchedule(campaign, now);
  const scheduleMessage = getCampaignScheduleMessage(campaign, locale, now);

  const t = dictionary[locale] ?? dictionary.en;
  const status: keyof typeof status_map = isActive
    ? "active"
    : hasEnded
      ? "closed"
      : "upcoming";

  return (
    <Card className="w-full overflow-hidden border-0 shadow-lg">
      <CardHeader className="p-6 pb-0">
        <div className="flex justify-between items-start gap-4">
          <div>
            <Badge variant="outline">{t.status[status]}</Badge>
            <h3 className="mt-2 text-xl font-bold tracking-tight">
              {campaign.title}
            </h3>
          </div>
          <Image
            src={"/images/abstract-placeholder.jpg"}
            alt="Campaign Image"
            width={120}
            height={120}
            className="aspect-square rounded-md object-cover"
          />
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <div className="space-y-5">
          <div>
            {progress !== null ? (
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-muted-foreground">{t.progress}</span>
                  <span className="text-muted-foreground">
                    {invitation_count} / {max_invitation}
                  </span>
                </div>
                <Progress value={progress * 100} className="h-2" />
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-6 pt-0 flex flex-col gap-2">
        {scheduleMessage ? (
          <p className="text-sm text-muted-foreground text-center">
            {scheduleMessage}
          </p>
        ) : null}
        <Button
          className="w-full"
          variant={isActive ? "default" : "outline"}
          disabled={!isActive}
        >
          {isActive ? t.go : hasEnded ? t.ended : t.soon}
        </Button>
      </CardFooter>
    </Card>
  );
}
