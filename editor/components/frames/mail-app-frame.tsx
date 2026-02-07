"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenu,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AvatarImage, AvatarFallback, Avatar } from "@/components/ui/avatar";
import { cn } from "@/components/lib/utils";
import { GridaLogo } from "../grida-logo";
import {
  ArchiveIcon,
  InboxIcon,
  SearchIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react";

export default function MailAppFrame({
  sidebarHidden,
  children,
  messages,
  message,
}: React.PropsWithChildren<{
  sidebarHidden?: boolean;
  messages: { title: string; from: string; at: string }[];
  message: {
    from: {
      name: string;
      email: string;
      avatar: string;
    };
    title: string;
    at: string;
  };
}>) {
  const today = useMemo(() => new Date(), []);

  return (
    <div
      data-sidebar-hidden={sidebarHidden}
      className="grid h-full min-h-[32rem] w-full overflow-hidden lg:data-[sidebar-hidden='false']:grid-cols-[320px_1fr]"
    >
      <div
        className={cn(
          "hidden border-r bg-gray-100/40 lg:block dark:bg-gray-800/40"
        )}
        style={{
          display: sidebarHidden ? "none" : undefined,
        }}
      >
        <div className="flex h-full max-h-screen flex-col gap-2">
          <div className="flex h-[60px] items-center border-b px-6">
            <Link className="flex items-center gap-2 font-semibold" href="#">
              <InboxIcon className="size-6" />
              <span className="">Mail</span>
            </Link>
          </div>
          <div className="flex-1 overflow-auto py-2">
            <nav className="grid items-start px-4 text-sm font-medium">
              <Link
                className="flex items-center gap-3 rounded-lg bg-gray-100 px-3 py-2 text-gray-900 transition-all hover:text-gray-900 dark:bg-gray-800 dark:text-gray-50 dark:hover:text-gray-50"
                href="#"
              >
                <InboxIcon className="size-4" />
                Inbox
              </Link>
              <Link
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-gray-500 transition-all hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
                href="#"
              >
                <ArchiveIcon className="size-4" />
                Archive
              </Link>
              <Link
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-gray-500 transition-all hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
                href="#"
              >
                <Trash2Icon className="size-4" />
                Trash
              </Link>
              <Link
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-gray-500 transition-all hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
                href="#"
              >
                <TagIcon className="size-4" />
                Labels
              </Link>
            </nav>
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-col overflow-hidden">
        <header className="flex h-14 lg:h-[60px] shrink-0 items-center gap-4 border-b bg-gray-100/40 px-6 dark:bg-gray-800/40">
          <div className="w-full flex-1">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-gray-500 dark:text-gray-400" />
              <Input
                className="w-full bg-white shadow-none appearance-none pl-8 md:w-2/3 lg:w-1/3 dark:bg-gray-950"
                placeholder="Search emails..."
                type="search"
              />
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="rounded-full border border-gray-200 size-8 dark:border-gray-800"
                size="icon"
                variant="ghost"
              >
                <GridaLogo size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Universe</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuItem>Support</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:gap-8">
          <div className="grid min-h-0 flex-1 grid-rows-[1fr] gap-4 md:grid-cols-[1fr_2fr]">
            <div className="min-h-0 bg-white rounded-lg shadow-sm overflow-hidden dark:bg-gray-950">
              <div className="flex flex-col h-full overflow-hidden">
                <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 dark:border-gray-800">
                  <h2 className="text-lg font-medium">Inbox</h2>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {today.toLocaleDateString()}
                  </div>
                </div>
                <div className="flex-1 overflow-auto">
                  <div className="grid gap-2 p-2">
                    {messages.map((msg, i) => (
                      <MessageItem
                        key={i}
                        title={msg.title}
                        from={msg.from}
                        at={msg.at}
                      />
                    ))}
                    {/* <MessageItem
                      title={"New Feature Release"}
                      from={"Jared Palmer"}
                      at={today.toLocaleDateString()}
                    />
                    <MessageItem
                      title={"Upcoming Team Offsite"}
                      from={"Olivia Liang"}
                      at={today.toLocaleDateString()}
                    />
                    <MessageItem
                      title={"Quarterly Report"}
                      from={"John Doe"}
                      at={today.toLocaleDateString()}
                    />
                    <MessageItem
                      title={"Design Feedback"}
                      from={"Sarah Anderson"}
                      at={today.toLocaleDateString()}
                    /> */}
                  </div>
                </div>
              </div>
            </div>
            <div className="min-h-0 bg-white rounded-lg shadow-sm overflow-hidden dark:bg-gray-950">
              <div className="flex h-full flex-col overflow-hidden">
                <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 dark:border-gray-800">
                  <h2 className="text-lg font-medium truncate">{message.title}</h2>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {message.at}
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage alt="Avatar" src="/placeholder-user.jpg" />
                      <AvatarFallback>{message.from.avatar}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{message.from.name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {message.from.email}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 prose prose-stone dark:prose-invert">
                    {children}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function MessageItem({
  title,
  from,
  at,
}: {
  title: string;
  from: string;
  at: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-gray-100 px-3 py-2 transition-all hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">
      <div className="flex-1">
        <div>
          <div className="font-medium">{from}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">{at}</div>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">{title}</div>
      </div>
    </div>
  );
}
