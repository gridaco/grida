import { Button } from "@/components/ui/button";
import { AvatarImage, AvatarFallback, Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ArrowLeftIcon } from "@radix-ui/react-icons";
import React from "react";
import clsx from "clsx";

export default function MessageAppFrame({
  sender,
  messages,
  hideInput,
}: {
  sender: {
    name: string;
    avatar: string;
    phone: string;
  };
  messages: {
    message: string;
    role: "incoming" | "outgoing";
  }[];
  hideInput?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 p-4 bg-gray-100 dark:bg-gray-900 h-full">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button className="rounded-full" size="icon" variant="ghost">
            <ArrowLeftIcon className="h-5 w-5" />
            <span className="sr-only">Back</span>
          </Button>
          <Avatar className="border w-10 h-10">
            <AvatarFallback>{sender.avatar}</AvatarFallback>
          </Avatar>
          <div className="grid gap-0.5">
            <p className="text-sm font-medium">{sender.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {sender.phone}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button className="rounded-full" size="icon" variant="ghost">
            <PhoneIcon className="h-5 w-5" />
            <span className="sr-only">Call</span>
          </Button>
          <Button className="rounded-full" size="icon" variant="ghost">
            <VideoIcon className="h-5 w-5" />
            <span className="sr-only">Video call</span>
          </Button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4">
          {messages?.map((message, index) => {
            if (message.role === "incoming") {
              return (
                <IncomingMessage key={index}>
                  <p>{message.message}</p>
                </IncomingMessage>
              );
            } else {
              return (
                <OutgoingMessage key={index}>
                  <p>{message.message}</p>
                </OutgoingMessage>
              );
            }
          })}
        </div>
      </div>
      <div className={clsx("border-t", hideInput ? "hidden" : "block")}>
        <form className="flex w-full items-center space-x-2 p-3">
          <Input
            autoComplete="off"
            className="flex-1"
            id="message"
            placeholder="Type your message..."
          />
          <Button className="rounded-full" size="icon" type="submit">
            <SendIcon className="h-5 w-5" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </div>
    </div>
  );
}

function OutgoingMessage({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] rounded-t-3xl rounded-bl-3xl bg-blue-500 px-4 py-3 text-white">
        {children}
      </div>
    </div>
  );
}

function IncomingMessage({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] rounded-t-3xl rounded-br-3xl bg-gray-200 px-4 py-3 text-gray-900 dark:bg-gray-700 dark:text-gray-100">
        {children}
      </div>
    </div>
  );
}

function PhoneIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function SendIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function VideoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  );
}
