import { GiftIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Page() {
  return (
    <main className="container mx-auto my-10">
      <div className="w-full h-full">
        <header className="flex items-center gap-4 border-b py-4 mb-4">
          <h1 className="text-2xl font-bold tracking-tight">Rewards</h1>
        </header>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Reward Settings</CardTitle>
              <CardDescription>
                Configure how participants are rewarded for their referrals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <GiftIcon className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">
                  Rewards Coming Soon
                </h3>
                <p className="text-sm text-muted-foreground text-center max-w-sm">
                  We&apos;re working on a powerful rewards system that will help
                  you incentivize and reward your participants. You&apos;ll be
                  able to set up custom rewards, track redemption, and manage
                  your reward budget.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Reward Types</CardTitle>
                <CardDescription>
                  Different ways to reward your participants
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Discount codes and coupons</li>
                  <li>• Gift cards and vouchers</li>
                  <li>• Points and credits</li>
                  <li>• Custom rewards</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Features</CardTitle>
                <CardDescription>
                  What you&apos;ll be able to do
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Set up tiered rewards</li>
                  <li>• Track reward redemption</li>
                  <li>• Manage reward inventory</li>
                  <li>• Automate reward distribution</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
