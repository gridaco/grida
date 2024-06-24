"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  CalendarIcon,
  ChatBubbleIcon,
  EnvelopeClosedIcon,
  GitHubLogoIcon,
  QuestionMarkCircledIcon,
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

export function EditorHelpFab() {
  return (
    <div className="absolute right-4 bottom-4">
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
          <div className="m-2 p-4 flex flex-col justify-center items-center text-center mb-4 gap-4 border rounded">
            <Image
              src="/images/customer-support-ceo.png"
              width={200}
              height={400}
              alt="customer-support-hi"
              className="w-32 h-32 rounded-lg object-cover"
            />
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
