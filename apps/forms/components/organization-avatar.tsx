import clsx from "clsx";
import { GridaLogo } from "@/components/grida-logo";
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
  if (avatar_url) {
    return (
      <Image
        src={avatar_url}
        width={40}
        height={40}
        alt={alt ?? "organization avatar"}
        className={clsx("overflow-hidden object-cover", className)}
      />
    );
  }
  return <GridaLogo className={className} />;
}
