import React from "react";
import { Button } from "@/components/ui/button";
import { AvatarFallback, Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ArrowUpIcon, ChevronLeft } from "lucide-react";
import { cn } from "@/components/lib/utils";

export default function MessageAppFrame({
  sender,
  messages,
  hideInput,
  className,
}: {
  sender: {
    avatar: string;
    name?: string;
    phone?: string;
  };
  messages: {
    message: string | React.ReactNode;
    role: "incoming" | "outgoing";
  }[];
  hideInput?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col h-full bg-white dark:bg-black", className)}
    >
      <header className="flex items-center justify-between px-4 py-2 bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Button className="rounded-full" size="icon" variant="ghost">
            <ChevronLeft className="size-5" />
            <span className="sr-only">Back</span>
          </Button>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Avatar className="border-2 border-gray-200 dark:border-gray-800 size-12">
            <AvatarFallback>{sender.avatar}</AvatarFallback>
          </Avatar>
          <p className="text-sm font-normal">{sender.name || sender.phone}</p>
        </div>
        <div className="flex items-center">
          <Button className="rounded-full" size="icon" variant="ghost">
            <VideoIcon className="size-5" />
            <span className="sr-only">FaceTime</span>
          </Button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-2">
        <div className="flex flex-col gap-2">
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
      <div
        className={cn(
          "bg-white dark:bg-black border-t border-gray-200 dark:border-gray-800",
          hideInput ? "hidden" : "block"
        )}
      >
        <form className="flex w-full items-center space-x-2 p-3">
          <Button className="rounded-full" size="icon" variant="ghost">
            <PlusIcon className="size-5" />
            <span className="sr-only">Add attachment</span>
          </Button>
          <div className="relative flex-1">
            <Input
              autoComplete="off"
              className="w-full rounded-full bg-[#F2F2F7] dark:bg-[#1C1C1E] border-gray-200 dark:border-gray-800 pr-12 py-4"
              id="message"
              placeholder="iMessage"
            />
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-[#007AFF] hover:bg-[#0066CC] text-white p-1.5"
              type="submit"
            >
              <ArrowUpIcon className="size-4" />
              <span className="sr-only">Send</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OutgoingMessage({ children }: React.PropsWithChildren) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] rounded-[20px] bg-[#007AFF] px-4 py-2 text-white">
        {children}
      </div>
    </div>
  );
}

function IncomingMessage({ children }: React.PropsWithChildren) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] rounded-[20px] bg-[#F2F2F7] dark:bg-[#2C2C2E] px-4 py-2 text-gray-900 dark:text-gray-100">
        {children}
      </div>
    </div>
  );
}

function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
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
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
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
