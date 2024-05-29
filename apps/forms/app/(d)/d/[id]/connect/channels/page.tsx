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
  LightningBoltIcon,
  QuestionMarkCircledIcon,
} from "@radix-ui/react-icons";
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
import MessageAppFrame from "@/components/frames/message-app-frame";
import { bird_sms_fees } from "@/k/sms_fees";
import MailAppFrame from "@/components/frames/mail-app-frame";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import toast from "react-hot-toast";
import React from "react";

const SMS_DEFAULT_ORIGINATOR = process.env
  .NEXT_PUBLIC_BIRD_SMS_DEFAULT_ORIGINATOR as string;

export default function ConnectChannels({
  params,
}: {
  params: {
    form_id: string;
  };
}) {
  const { form_id } = params;

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
            <PreferenceBoxHeader
              heading={
                <>
                  SMS Notifications
                  <Badge variant="outline" className="ms-2 align-middle">
                    Add-on
                  </Badge>
                </>
              }
            />
            <PreferenceBody>
              <div className="max-w-sm max-h-96 rounded-3xl border-4 overflow-hidden">
                <MessageAppFrame
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
              <section className="py-5">
                <div className="grid gap-2">
                  <Label htmlFor="originator">Originator</Label>
                  <Select name="originator" defaultValue="default">
                    <SelectTrigger id="originator">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">
                        {SMS_DEFAULT_ORIGINATOR} (default)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </section>
              <section className="my-10">
                <AboutSMSFees />
                <TestSMS form_id={form_id} />
              </section>
            </PreferenceBody>
          </PreferenceBox>
          <PreferenceBox>
            <PreferenceBoxHeader heading={<>Email Notifications</>} />
            <PreferenceBody>
              <div className="max-h-96 rounded-3xl border-4 overflow-hidden">
                <MailAppFrame
                  sidebarHidden
                  message={{
                    at: "Just now",
                    from: {
                      name: "Grida Forms",
                      email: "notifications@forms.grida.co",
                      avatar: "GR",
                    },
                    title: "Your Ticket is Ready",
                  }}
                  messages={[
                    {
                      from: "Grida Forms",
                      title: "Your Ticket is Ready",
                      at: "Just now",
                    },
                    {
                      from: "Grida Forms",
                      title: "Your submission has been received",
                      at: "20 Minutes ago",
                    },
                    {
                      from: "Grida Forms",
                      title: "Registration is now open",
                      at: "28 Minutes ago",
                    },
                  ]}
                >
                  <p>Dear team,</p>
                  <p>
                    Im excited to announce the release of our latest feature
                    update. This release includes several new capabilities that
                    will help you work more efficiently and effectively.
                  </p>
                  <p>Some of the key highlights include:</p>
                  <ul>
                    <li>Improved email search and filtering</li>
                    <li>Enhanced email templates and signatures</li>
                    <li>
                      Seamless integration with our project management tools
                    </li>
                  </ul>
                  <p>
                    Weve been working hard to deliver these improvements, and
                    were confident they will have a positive impact on your
                    daily workflow. Please let me know if you have any questions
                    or feedback.
                  </p>
                  <p>
                    Best regards,
                    <br />
                    Jared
                  </p>
                </MailAppFrame>
              </div>
              <section className="py-5">
                <div className="grid gap-2">
                  <Label htmlFor="emailfrom">From</Label>
                  <Select name="emailfrom" defaultValue="default">
                    <SelectTrigger id="emailfrom">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">
                        notifications@forms.grida.co
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </section>
            </PreferenceBody>
          </PreferenceBox>
        </SectorBlocks>
      </Sector>
    </main>
  );
}

function TestSMS({ form_id }: { form_id: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");

  const onSend = () => {
    setBusy(true);
    const sending = fetch(
      `/private/editor/connect/${form_id}/channels/sms/test`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: phone,
          message: message,
        }),
      }
    );

    toast.promise(sending, {
      loading: "Sending SMS...",
      success: "SMS sent successfully",
      error: "Failed to send SMS",
    });

    sending.finally(() => setBusy(false));
  };

  return (
    <Dialog>
      <DialogTrigger>
        <Badge variant={"outline"}>
          <LightningBoltIcon className="w-3 h-3 inline align-middle me-2" />
          Test
        </Badge>
      </DialogTrigger>
      <DialogContent className="max-w-screen-lg">
        <DialogHeader>
          <DialogTitle>Test SMS Notifications</DialogTitle>
          <DialogDescription>
            Send a test SMS to your phone to verify the message format.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-4">
          <aside className="col-span-1 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="originator">Originator</Label>
              <Input
                id="originator"
                type="tel"
                value={SMS_DEFAULT_ORIGINATOR}
                readOnly
                disabled
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter your phone number"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Enter your message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
              />
            </div>
          </aside>
          <aside className="col-span-2 shadow-lg rounded-lg border-2 overflow-hidden">
            <MessageAppFrame
              hideInput
              sender={{
                name: "Grida Forms",
                avatar: "GR",
                phone: SMS_DEFAULT_ORIGINATOR,
              }}
              messages={[
                {
                  message: (
                    <>
                      {message.split("\n").map((line, index) => (
                        <React.Fragment key={index}>
                          {line}
                          <br />
                        </React.Fragment>
                      ))}
                    </>
                  ),
                  role: "incoming",
                },
              ]}
            />
          </aside>
        </div>
        <DialogFooter>
          <Button disabled={busy} onClick={onSend}>
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AboutSMSFees() {
  return (
    <Collapsible>
      <CollapsibleTrigger>
        <Badge variant={"outline"}>
          <QuestionMarkCircledIcon className="w-3 h-3 inline align-middle me-2" />
          Learn more about SMS Fees
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <article className="my-4 prose dark:prose-invert">
          <strong>For Pro Users,</strong> please refer to our{" "}
          <Link href="/pricing" target="_blank">
            standard pricing
          </Link>
          <br />
          <br />
          <strong>For Enterprise Users</strong>
          <h6>Large-scale SMS messaging for enterprise customers</h6>
          <p>
            For enterprise customers, we offer dedicated pricing for SMS,{" "}
            <Link href="https://bird.com/" target="_blank">
              by <BirdLogo size={20} className="inline" />.
            </Link>
            <br />
            <i>We take 0 margin on the SMS fees,</i> and you pay exactly what
            you would pay to the carrier.
          </p>
        </article>
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "Unit",
                "Destination Country",
                "Originator Type",
                "Unit price",
              ].map((th) => (
                <TableHead key={th}>{th}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bird_sms_fees.map(([a, b, c, d], i) => (
              <TableRow key={i}>
                <TableCell>
                  <small>{a}</small>
                </TableCell>
                <TableCell>{b}</TableCell>
                <TableCell>{c}</TableCell>
                <TableCell>{d}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CollapsibleContent>
    </Collapsible>
  );
}
