"use client";

import { BirdLogo } from "@/components/logos";
import Link from "next/link";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxHeader,
  Sector,
  SectorBlocks,
  SectorDescription,
  SectorHeader,
  SectorHeading,
} from "@/components/preferences";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  OpenInNewWindowIcon,
  QuestionMarkCircledIcon,
} from "@radix-ui/react-icons";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import MessageDemo from "@/components/chat/message-demo";

const SMS_DEFAULT_ORIGINATOR = process.env
  .NEXT_PUBLIC_BIRD_SMS_DEFAULT_ORIGINATOR as string;

export default function ConnectChannels() {
  return (
    <main className="max-w-2xl mx-auto">
      <Sector>
        <SectorHeader>
          <SectorHeading>
            Channels
            <Badge className="ms-2 align-middle">Pro</Badge>
          </SectorHeading>
          <SectorDescription>
            Connect with your customers through SMS and Email.
          </SectorDescription>
        </SectorHeader>
        <SectorBlocks>
          <PreferenceBox>
            <PreferenceBoxHeader heading={<>SMS Notifications</>} />
            <PreferenceBody>
              <div className="max-w-sm max-h-96 rounded-3xl border-4 overflow-hidden">
                <MessageDemo
                  hideInput
                  sender={{
                    name: "Grida Forms",
                    avatar: "GR",
                    phone: SMS_DEFAULT_ORIGINATOR,
                  }}
                  messages={[
                    {
                      message: "Event is openning soon. Register now!",
                      role: "incoming",
                    },
                    {
                      message: "Your submission has been received.",
                      role: "incoming",
                    },
                  ]}
                />
              </div>
              <Collapsible>
                <CollapsibleTrigger>
                  <Badge variant={"outline"}>$ View Pricing</Badge>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <label>
                    SMS{" "}
                    <span>
                      <Link href="https://bird.com/" target="_blank">
                        by <BirdLogo size={20} className="inline" />
                      </Link>
                    </span>
                  </label>
                  <p>
                    When exceeding the included messages, the following rates
                    apply
                  </p>
                  <Table className="mt-4">
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          Type
                          <HoverCard>
                            <HoverCardTrigger>
                              <QuestionMarkCircledIcon className="ms-2 inline align-middle" />
                            </HoverCardTrigger>
                            <HoverCardContent>
                              <Link
                                href="https://en.wikipedia.org/wiki/List_of_country_calling_codes"
                                target="_blank"
                              >
                                Learn more about country calling codes
                                <OpenInNewWindowIcon className="ms-2 inline align-middle" />
                              </Link>
                            </HoverCardContent>
                          </HoverCard>
                        </TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>SMS</TableHead>
                        <TableHead>MMS</TableHead>
                        <TableHead>Two-way</TableHead>
                        <TableHead>Country</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>Zone 1</TableCell>
                        <TableCell>$0.0077</TableCell>
                        <TableCell>Yes</TableCell>
                        <TableCell>No</TableCell>
                        <TableCell>Yes</TableCell>
                        <TableCell>🇺🇸 🇨🇦</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Zone 2 ~ 9</TableCell>
                        <TableCell>$0.008</TableCell>
                        <TableCell>Yes</TableCell>
                        <TableCell>No</TableCell>
                        <TableCell>Vary</TableCell>
                        <TableCell>
                          <Link
                            href="https://docs.bird.com/applications/channels/channels/supported-channels/sms/concepts/choosing-the-right-sender-availability-and-restrictions-by-country#countries-and-restrictions"
                            target="_blank"
                          >
                            🇪🇺 🇬🇧 🇲🇽 🇰🇷 🇯🇵 +50
                          </Link>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CollapsibleContent>
              </Collapsible>

              <section className="py-5">
                <Label>Originator</Label>
                <Select defaultValue="default">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">
                      {SMS_DEFAULT_ORIGINATOR} (default)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </section>
            </PreferenceBody>
          </PreferenceBox>
        </SectorBlocks>
      </Sector>

      <section>
        <h2>Email</h2>
      </section>
    </main>
  );
}
