"use client";

import { BirdLogo, KakaoTalkLogo, WhatsAppLogo } from "@/components/logos";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui-editor/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";
import React from "react";
import { MessageCircleIcon } from "lucide-react";
import { useEditorState } from "@/scaffolds/editor";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NotificationRespondentEmailPreferences } from "@/scaffolds/settings/notification-respondent-email-preferences";

const SMS_DEFAULT_ORIGINATOR = process.env
  .NEXT_PUBLIC_BIRD_SMS_DEFAULT_ORIGINATOR as string;

export default function ConnectChannels() {
  const [state] = useEditorState();
  const { form } = state;

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
          <NotificationRespondentEmailPreferences />
          <PreferenceBox disabled>
            <PreferenceBoxHeader
              heading={
                <>
                  <MessageCircleIcon className="inline me-2 size-5 align-middle" />
                  SMS Notifications
                  <Badge variant="outline" className="ms-2 align-middle">
                    Coming soon
                  </Badge>
                </>
              }
              description={
                <>
                  SMS notifications are not ready yet. This section is currently
                  disabled.
                </>
              }
            />
            <PreferenceBody>
              <div className="pointer-events-none">
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
                        message: "Event is opening soon. Register now!",
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
                  <Field>
                    <FieldLabel htmlFor="originator">Originator</FieldLabel>
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
                  </Field>
                </section>
                <section className="my-10">
                  <AboutSMSFees />
                  <TestSMS form_id={form.form_id} />
                </section>
              </div>
            </PreferenceBody>
          </PreferenceBox>
          <PreferenceBox>
            <PreferenceBoxHeader
              heading={
                <>
                  <WhatsAppLogo className="inline me-2 size-5 align-middle" />
                  WhatsApp
                  <Badge variant="outline" className="ms-2 align-middle">
                    Add-on
                  </Badge>
                </>
              }
            />
            <PreferenceBody>
              Contact us to enable WhatsApp for your project.
            </PreferenceBody>
          </PreferenceBox>
          <PreferenceBox>
            <PreferenceBoxHeader
              heading={
                <>
                  <KakaoTalkLogo className="inline me-2 size-5 align-middle" />
                  Kakao Talk
                  <Badge variant="outline" className="ms-2 align-middle">
                    Enterprise
                  </Badge>
                </>
              }
            />
            <PreferenceBody>
              Contact us to enable Kakao Talk for your enterprise account.
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
          <LightningBoltIcon className="size-3" />
          Test
        </Badge>
      </DialogTrigger>
      <DialogContent className="!max-w-screen-lg">
        <DialogHeader>
          <DialogTitle>Test SMS Notifications</DialogTitle>
          <DialogDescription>
            Send a test SMS to your phone to verify the message format.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-4">
          <aside className="col-span-1 grid gap-4">
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="originator">Originator</FieldLabel>
                <Input
                  id="originator"
                  type="tel"
                  value={SMS_DEFAULT_ORIGINATOR}
                  readOnly
                  disabled
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Phone Number</FieldLabel>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter your phone number"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="message">Message</FieldLabel>
                <Textarea
                  id="message"
                  placeholder="Enter your message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                />
              </Field>
            </FieldGroup>
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
          <QuestionMarkCircledIcon />
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
