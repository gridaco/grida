import { SideNavBadge, SideNavItem } from "@/components/sidenav";
import { CodeIcon, GearIcon, MagicWandIcon } from "@radix-ui/react-icons";
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
      <nav className="col-span-1 max-w-xs min-w-60 w-min border-r dark:border-r-neutral-800">
        <ul className="flex flex-col">
          <li>
            <Link href={`/d/${id}/settings/general`}>
              <SideNavItem>
                <GearIcon />
                General
              </SideNavItem>
            </Link>
          </li>
          <li>
            <Link href={`/d/${id}/settings/customize`}>
              <SideNavItem>
                <MagicWandIcon />
                Customize
              </SideNavItem>
            </Link>
          </li>
          <li>
            {/* <Link href={`/d/${id}/settings/api`}> */}
            <SideNavItem disabled>
              <CodeIcon />
              API Keys
              <SideNavBadge>soon</SideNavBadge>
            </SideNavItem>
            {/* </Link> */}
          </li>
        </ul>
      </nav>
      <div className="w-full h-full overflow-scroll p-4 pb-20">{children}</div>
    </main>
  );
}
