import { SideNavBadge, SideNavItem } from "@/components/sidenav";
import {
  ArchiveIcon,
  AvatarIcon,
  BoxIcon,
  BoxModelIcon,
  CodeIcon,
  Link2Icon,
} from "@radix-ui/react-icons";
import Link from "next/link";

export default function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: { id: string };
}>) {
  const id = params.id;

  return (
    <main className="flex flex-1">
      {/* side */}
      <nav className="col-span-1 max-w-xs min-w-60 w-min border-r dark:border-r-neutral-800 h-full">
        <ul className="flex flex-col">
          <li>
            <Link href={`/d/${id}/data/responses`}>
              <SideNavItem>
                <BoxModelIcon />
                Responses
              </SideNavItem>
            </Link>
          </li>
          <li>
            <Link href={`/d/${id}/data/orders`}>
              <SideNavItem>
                <ArchiveIcon />
                Orders
              </SideNavItem>
            </Link>
          </li>
        </ul>
      </nav>
      <div className="flex flex-1 overflow-hidden">{children}</div>
    </main>
  );
}
