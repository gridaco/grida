"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Platform } from "@/lib/platform";
import { createClientWestReferralClient } from "@/lib/supabase/client";
import { OpenInNewWindowIcon } from "@radix-ui/react-icons";
import { useCampaign } from "./store";

const QUESTNAME = "refer-a-friend"; // TODO:

type ReferrerQuest = Platform.WEST.Referral.Referrer & {
  customer: Platform.WEST.Referral.Customer;
  invitations: (Platform.WEST.Referral.Invitation & {
    customer: Platform.WEST.Referral.Customer | null;
  })[];
};

function useReferrerQuests(campaign_id: number) {
  const [tokens, setTokens] = useState<ReferrerQuest[] | null>(null);
  const client = useMemo(() => createClientWestReferralClient(), []);
  const campaign = useCampaign();

  useEffect(() => {
    client
      .from("referrer")
      .select(
        `
          *,
          customer:customer!customer_id(*),
          invitations:invitation(
            *,
            customer:customer(*)
          )
        `
      )
      .eq("campaign_id", campaign_id)
      .then(({ data, error }) => {
        if (error) return;
        setTokens(data as ReferrerQuest[]);
      });
  }, [client, campaign_id]);

  return { tokens };
}

export function QuestsTable() {
  const campaign = useCampaign();
  const [expandedQuests, setExpandedQuests] = useState<string[]>([]);

  const { tokens } = useReferrerQuests(campaign.id);

  // FIXME:
  const max_invitations_per_referrer = 10;

  const toggleQuestExpand = (questId: string) => {
    setExpandedQuests((prev) =>
      prev.includes(questId)
        ? prev.filter((id) => id !== questId)
        : [...prev, questId]
    );
  };

  const getStatusBadge = (status: "active" | "completed" | "expired") => {
    switch (status) {
      case "active":
        return (
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200"
          >
            Active
          </Badge>
        );
      case "completed":
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200"
          >
            Completed
          </Badge>
        );
      case "expired":
        return (
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-700 border-amber-200"
          >
            Expired
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (!tokens) {
    return null;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center p-4 border-b">
          <div className="flex-1">
            <Select defaultValue="all">
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Quests</SelectItem>
                <SelectItem disabled value="active">
                  Active
                </SelectItem>
                <SelectItem disabled value="completed">
                  Completed
                </SelectItem>
                <SelectItem disabled value="expired">
                  Expired
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            Showing <strong>{tokens.length}</strong> quests
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Player</TableHead>
              <TableHead>Quest</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Invites</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.map((quest) => (
              <>
                <TableRow key={quest.id} className="group">
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleQuestExpand(quest.id)}
                    >
                      {expandedQuests.includes(quest.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span className="sr-only">Toggle details</span>
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 rounded-full">
                        <AvatarFallback>
                          {quest.customer?.name?.[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {quest.customer?.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {quest.customer?.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{QUESTNAME}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="text-xs text-muted-foreground">
                        {(quest.invitation_count /
                          (max_invitations_per_referrer ?? 0)) *
                          100}
                        %
                      </div>
                      <Progress
                        value={
                          (quest.invitation_count /
                            (max_invitations_per_referrer ?? 0)) *
                          100
                        }
                        className="h-2"
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {quest.invitation_count} /{" "}
                        {max_invitations_per_referrer ?? "∞"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(
                      quest.invitation_count === max_invitations_per_referrer
                        ? "completed"
                        : "active"
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(quest.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            open(`/r/${campaign.ref}/${quest.code}`, "_blank");
                          }}
                        >
                          <OpenInNewWindowIcon className="size-4 me-2" />
                          Open URL
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled>
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled>Edit Quest</DropdownMenuItem>
                        <DropdownMenuItem disabled>
                          Send Reminder
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>

                {expandedQuests.includes(quest.id) && (
                  <TableRow className="bg-muted/50">
                    <TableCell colSpan={8} className="p-0">
                      <div className="p-4">
                        <h3 className="text-sm font-medium mb-2">
                          Invitations ({quest.invitations.length})
                        </h3>
                        <div className="bg-background rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Onboarding</TableHead>
                                <TableHead>Step 1: Claim</TableHead>
                                <TableHead>Step 2: Submit Form</TableHead>
                                <TableHead>
                                  Step 3: Complete Test Drive
                                </TableHead>
                                <TableHead className="text-right">
                                  Status
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {quest.invitations.map((challenge) => (
                                <TableRow key={challenge.id}>
                                  <TableCell>
                                    <div>
                                      <div className="font-medium">
                                        {challenge.customer?.name ?? "-"}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {challenge.customer?.email ??
                                          challenge.customer?.phone ??
                                          "-"}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    {challenge.is_claimed ? (
                                      <div className="flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                        {/* <span>{challenge.steps[0].date}</span> */}
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-amber-500" />
                                        <span>Pending</span>
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                                      <span className="text-muted-foreground">
                                        Not Started
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell></TableCell>
                                  <TableCell className="text-right">
                                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                      {challenge.is_claimed
                                        ? "claimed"
                                        : "not claimed"}
                                    </Badge>
                                    {/* {challenge.steps.every(
                                      (step) => step.completed
                                    ) ? (
                                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                        Completed
                                      </Badge>
                                    ) : challenge.steps.some(
                                        (step) => step.completed
                                      ) ? (
                                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                                        In Progress
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline">
                                        Not Started
                                      </Badge>
                                    )} */}
                                  </TableCell>
                                </TableRow>
                              ))}
                              {/* {quest.invitedCount < quest.maxInvites && (
                                <TableRow>
                                  <TableCell colSpan={4}>
                                    <Button
                                      variant="ghost"
                                      className="text-xs h-8"
                                    >
                                      <Plus className="h-3 w-3 mr-1" />
                                      Send New Invitation (
                                      {quest.maxInvites -
                                        quest.invitedCount}{" "}
                                      remaining)
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              )} */}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
