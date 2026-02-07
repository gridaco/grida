import * as React from "react";
import { cn } from "@/components/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/* ─── Root ─── */

function EmailFrame({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* ─── Subject bar ─── */

interface EmailFrameSubjectProps extends React.HTMLAttributes<HTMLDivElement> {
  actions?: React.ReactNode;
}

function EmailFrameSubject({
  children,
  actions,
  className,
  ...props
}: EmailFrameSubjectProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b bg-muted/40 px-4 py-2.5",
        className
      )}
      {...props}
    >
      <span className="text-sm font-semibold text-foreground truncate">
        {children}
      </span>
      {actions && (
        <div className="flex items-center gap-0.5 shrink-0">{actions}</div>
      )}
    </div>
  );
}

/* ─── Sender ─── */

interface EmailFrameSenderProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  email: string;
  avatar?: string;
  date?: React.ReactNode;
  to?: React.ReactNode;
}

function EmailFrameSender({
  name,
  email,
  avatar,
  date,
  to,
  className,
  ...props
}: EmailFrameSenderProps) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={cn("flex items-start gap-3 border-b px-4 py-3", className)}
      {...props}
    >
      <Avatar className="h-8 w-8 mt-0.5">
        {avatar && (
          <AvatarImage src={avatar || "/placeholder.svg"} alt={name} />
        )}
        <AvatarFallback className="text-[11px] font-medium">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {name}
          </span>
          {date && (
            <span className="text-xs text-muted-foreground shrink-0">
              {date}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{email}</p>
        {to && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {"to "}
            {to}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Body ─── */

function EmailFrameBody({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-4 py-4 text-sm leading-relaxed text-foreground flex-1 min-h-0 overflow-y-auto",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export {
  EmailFrame,
  EmailFrameSubject,
  EmailFrameSender,
  EmailFrameBody,
};
