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
import { createClientWestClient } from "@/lib/supabase/client";

const QUESTNAME = "Referral Campaign";

// // Mock data for demonstration
// const mockQuests = Array.from({ length: 10 }).map((_, i) => ({
//   id: `quest-${i + 1}`,
//   player: {
//     id: `player-${i + 1}`,
//     name: `Player ${i + 1}`,
//     email: `player${i + 1}@example.com`,
//     avatar: `/placeholder.svg?height=40&width=40`,
//   },
//   questName: "Referral Campaign",
//   progress: Math.floor(Math.random() * 100),
//   invitedCount: Math.floor(Math.random() * 11), // 0-10 invites
//   maxInvites: 10,
//   status: ["active", "completed", "expired"][Math.floor(Math.random() * 3)],
//   startDate: new Date(
//     Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000
//   )
//     .toISOString()
//     .split("T")[0],
//   challenges: Array.from({ length: Math.floor(Math.random() * 5) + 1 }).map(
//     (_, j) => ({
//       id: `challenge-${i}-${j}`,
//       invitee: `Friend ${j + 1}`,
//       email: `friend${j + 1}@example.com`,
//       steps: [
//         {
//           id: `step-${i}-${j}-1`,
//           name: "Sign Up",
//           completed: Math.random() > 0.3,
//           date: new Date(
//             Date.now() - Math.floor(Math.random() * 10) * 24 * 60 * 60 * 1000
//           )
//             .toISOString()
//             .split("T")[0],
//         },
//         {
//           id: `step-${i}-${j}-2`,
//           name: "Submit Form",
//           completed: Math.random() > 0.6,
//           date:
//             Math.random() > 0.6
//               ? new Date(
//                   Date.now() -
//                     Math.floor(Math.random() * 5) * 24 * 60 * 60 * 1000
//                 )
//                   .toISOString()
//                   .split("T")[0]
//               : null,
//         },
//       ],
//     })
//   ),
// }));

type QuestToken = Platform.WEST.Token & {
  owner: Platform.WEST.ParticipantCustomer | null;
  children: (Platform.WEST.Token & {
    owner: Platform.WEST.ParticipantCustomer | null;
  })[];
};

function useQuestTokens(series_id: string) {
  const [tokens, setTokens] = useState<QuestToken[] | null>(null);
  const client = useMemo(() => createClientWestClient(), []);

  useEffect(() => {
    client
      .from("token")
      .select(
        `
        *,
        owner:participant_customer!owner_id(*),
        children:token(*, owner:participant_customer!owner_id(*))
      `
      )
      .eq("series_id", series_id)
      .eq("token_type", "mintable")
      .then(({ data, error }) => {
        if (error) return;
        setTokens(data as QuestToken[]);
      });
  }, [client, series_id]);

  return { tokens };
}

export function QuestsTable({ series_id }: { series_id: string }) {
  const [expandedQuests, setExpandedQuests] = useState<string[]>([]);

  const { tokens } = useQuestTokens(series_id);

  console.log("tokens", tokens);

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
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
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
                          {quest.owner?.name?.[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{quest.owner?.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {quest.owner?.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{QUESTNAME}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="text-xs text-muted-foreground">
                        0000%
                        {/* {quest.progress}% */}
                      </div>
                      <Progress
                        value={
                          0
                          // quest.progress
                        }
                        className="h-2"
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>
                        0/0
                        {/* {quest.invitedCount}/{quest.maxInvites} */}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge("active")}</TableCell>
                  <TableCell>
                    {/* {quest.startDate} */}
                    2020-01-01
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
                        <DropdownMenuItem>View Details</DropdownMenuItem>
                        <DropdownMenuItem>Edit Quest</DropdownMenuItem>
                        <DropdownMenuItem>Send Reminder</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>

                {expandedQuests.includes(quest.id) && (
                  <TableRow className="bg-muted/50">
                    <TableCell colSpan={8} className="p-0">
                      <div className="p-4">
                        <h3 className="text-sm font-medium mb-2">
                          Challenges ({quest.children.length})
                        </h3>
                        <div className="bg-background rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Invitee</TableHead>
                                <TableHead>Step 1: Sign Up</TableHead>
                                <TableHead>Step 2: Submit Form</TableHead>
                                <TableHead className="text-right">
                                  Status
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {quest.children.map((challenge) => (
                                <TableRow key={challenge.id}>
                                  <TableCell>
                                    <div>
                                      <div className="font-medium">
                                        {challenge.owner?.name}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {challenge.owner?.email}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    {/* {challenge.steps[0].completed ? (
                                      <div className="flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                        <span>{challenge.steps[0].date}</span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-amber-500" />
                                        <span>Pending</span>
                                      </div>
                                    )} */}
                                  </TableCell>
                                  <TableCell>
                                    {/* {challenge.steps[1].completed ? (
                                      <div className="flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                        <span>{challenge.steps[1].date}</span>
                                      </div>
                                    ) : challenge.steps[0].completed ? (
                                      <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-amber-500" />
                                        <span>In Progress</span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">
                                          Not Started
                                        </span>
                                      </div>
                                    )} */}
                                  </TableCell>
                                  <TableCell className="text-right">
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
