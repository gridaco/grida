"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  CalendarIcon,
  EnvelopeClosedIcon,
  GitHubLogoIcon,
  QuestionMarkIcon,
} from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { SlackIcon } from "lucide-react";
import { sendGAEvent } from "@next/third-parties/google";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useWorkspace } from "../workspace";
import Head from "next/head";

function useGAAuthenticatedUserIDTelemetry() {
  const { state } = useWorkspace();
  const [uid, setUid] = useState<string>();

  const supabase = useMemo(
    () => createClientComponentClient({ isSingleton: false }),
    []
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUid(data.user?.id);
    });
  }, [supabase]);

  useEffect(() => {
    if (!uid) return;
    if (process.env.NEXT_PUBLIC_GAID) {
      window.dataLayer?.push({ user_id: uid });
      sendGAEvent("event", "workspace", {
        org: state.organization.name,
      });
    }
  }, [uid, state.organization.name]);
}

function AnimatedAvatar() {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <>
      <Head>
        <link
          rel="preload"
          href="/images/customer-support-ceo-wink.png"
          as="image"
        />
        <link
          rel="preload"
          href="/images/customer-support-ceo.png"
          as="image"
        />
      </Head>
      <Image
        priority
        src={
          isHovered
            ? "/images/customer-support-ceo-wink.png"
            : "/images/customer-support-ceo.png"
        }
        width={400}
        height={400}
        alt="customer-support-hi"
        className="w-32 h-32 rounded-lg object-cover border shadow"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
    </>
  );
}

export function EditorHelpFab() {
  // this is a good place to track authenticated user id - as its global by workspace and unique.
  useGAAuthenticatedUserIDTelemetry();

  return (
    <div className="fixed right-4 bottom-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="rounded-full" size="icon">
            <QuestionMarkIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="top"
          sideOffset={10}
          className="max-w-sm overflow-hidden"
        >
          <div className="m-2 p-4 flex flex-col justify-center items-center text-center mb-4 gap-4 rounded">
            <AnimatedAvatar />
            <article className="prose prose-sm dark:prose-invert">
              <p>
                👋 Hi! I&apos;m the CEO of Grida.
                <br />
                Have questions? DM me on{" "}
                <Link href="https://grida.co/join-slack" target="_blank">
                  <SlackIcon className="inline align-middle w-3.5 h-3.5 me-1" />
                  Slack
                </Link>{" "}
                or email me at{" "}
                <Link href="mailto:universe@grida.co">
                  <EnvelopeClosedIcon className="inline align-middle w-3.5 h-3.5 me-1" />
                  universe@grida.co
                </Link>
                . I&apos;m here to help!
              </p>
            </article>
          </div>
          {/* <Link href={"/help"}>
            <DropdownMenuItem>
              <QuestionMarkCircledIcon className="align-middle me-1" />
              Help Center
            </DropdownMenuItem>
          </Link> */}
          <Link href="https://grida.co/join-slack" target="_blank">
            <DropdownMenuItem>
              <SlackIcon className="inline align-middle w-4 h-4 me-1" />
              Chat with us
            </DropdownMenuItem>
          </Link>
          <Link
            href="https://github.com/gridaco/grida/issues/new/choose"
            target="_blank"
          >
            <DropdownMenuItem>
              <GitHubLogoIcon className="align-middle me-1" />
              Open new Issue on Github
            </DropdownMenuItem>
          </Link>
          <Link
            href="https://github.com/gridaco/grida/issues/new/choose"
            target="_blank"
          >
            <DropdownMenuItem>
              <GitHubLogoIcon className="align-middle me-1" />
              Request a feature
            </DropdownMenuItem>
          </Link>
          <Link
            href="https://cal.com/universe-from-grida/15min"
            target="_blank"
          >
            <DropdownMenuItem>
              <CalendarIcon className="align-middle me-1" />
              Book a meeting
            </DropdownMenuItem>
          </Link>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
