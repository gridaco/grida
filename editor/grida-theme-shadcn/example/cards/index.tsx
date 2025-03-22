import { CardsActivityGoal } from "./activity-goal";
import { CardsCalendar } from "./calendar";
import { CardsChat } from "./chat";
import { CardsCookieSettings } from "./cookie-settings";
import { CardsCreateAccount } from "./create-account";
import { CardsMetric } from "./metric";
import { CardsPaymentMethod } from "./payment-method";
import { CardsReportIssue } from "./report-issue";
import { CardsShare } from "./share";
import { CardsStats } from "./stats";
import { CardsTeamMembers } from "./team-members";

export function CardsDemo() {
  return (
    <div className="@container/cards">
      <div className="@md/cards:grids-col-2 grid @md/cards:gap-4 @lg/cards:grid-cols-10 @xl/cards:grid-cols-11 @xl/cards:gap-4">
        <div className="space-y-4 @lg/cards:col-span-4 @xl/cards:col-span-6 @xl/cards:space-y-4">
          <CardsStats />
          <div className="grid gap-1 @sm/cards:grid-cols-[260px_1fr] @md/cards:hidden">
            <CardsCalendar />
            <div className="pt-3 @sm/cards:pl-2 @sm/cards:pt-0 @xl/cards:pl-4">
              <CardsActivityGoal />
            </div>
            <div className="pt-3 @sm/cards:col-span-2 @xl/cards:pt-4">
              <CardsMetric />
            </div>
          </div>
          <div className="grid gap-4 @md/cards:grid-cols-2 @lg/cards:grid-cols-1 @xl/cards:grid-cols-2">
            <div className="space-y-4 @xl/cards:space-y-4">
              <CardsTeamMembers />
              <CardsCookieSettings />
              <CardsPaymentMethod />
            </div>
            <div className="space-y-4 @xl/cards:space-y-4">
              <CardsChat />
              <CardsCreateAccount />
              <div className="hidden @xl/cards:block">
                <CardsReportIssue />
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-4 @lg/cards:col-span-6 @xl/cards:col-span-5 @xl/cards:space-y-4">
          <div className="hidden gap-1 @sm/cards:grid-cols-[260px_1fr] @md/cards:grid">
            <CardsCalendar />
            <div className="pt-3 @sm/cards:pl-2 @sm/cards:pt-0 @xl/cards:pl-3">
              <CardsActivityGoal />
            </div>
            <div className="pt-3 @sm/cards:col-span-2 @xl/cards:pt-3">
              <CardsMetric />
            </div>
          </div>
          <CardsShare />
          <div className="@xl/cards:hidden">
            <CardsReportIssue />
          </div>
        </div>
      </div>
    </div>
  );
}
