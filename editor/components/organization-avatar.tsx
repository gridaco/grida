"use client";

import clsx from "clsx";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Image from "next/image";

export function OrganizationAvatar({
  className,
  avatar_url,
  alt,
}: {
  avatar_url?: string | null;
  className?: string;
  alt?: string;
}) {
  return (
    <Avatar className={className}>
      {avatar_url ? (
        <Image
          src={avatar_url}
          width={40}
          height={40}
          alt={alt ?? "organization avatar"}
          className={clsx("overflow-hidden object-cover")}
        />
      ) : (
        <AvatarFallback className="rounded-none font-bold">
          {alt?.charAt(0).toUpperCase()}
        </AvatarFallback>
      )}
    </Avatar>
  );
}
