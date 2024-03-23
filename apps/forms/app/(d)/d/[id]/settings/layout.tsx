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
    <main className="flex h-screen">
      {/* side */}
      <nav className="col-span-1 max-w-xs min-w-60 w-min border-r h-full">
        <ul className="flex flex-col">
          <li>
            <Link href={`/d/${id}/settings/general`}>
              <button className="w-full text-left px-4 py-4 bg-transparent hover:bg-neutral-500/10">
                General
              </button>
            </Link>
          </li>
          <li>
            <Link href={`/d/${id}/settings/share/link`}>
              <button className="w-full text-left px-4 py-4 bg-transparent hover:bg-neutral-500/10">
                Share the link
              </button>
            </Link>
          </li>
          <li>
            <Link href={`/d/${id}/settings/share/embed`}>
              <button className="w-full text-left px-4 py-4 bg-transparent hover:bg-neutral-500/10">
                Embed in a webpage
              </button>
            </Link>
          </li>
          <li>
            <Link href={`/d/${id}/settings/share/custom`}>
              <button className="w-full text-left px-4 py-4 bg-transparent hover:bg-neutral-500/10">
                Use custom renderer
              </button>
            </Link>
          </li>
          <li>
            <Link href={`/d/${id}/settings/share/api`}>
              <button className="w-full text-left px-4 py-4 bg-transparent hover:bg-neutral-500/10">
                Use API
              </button>
            </Link>
          </li>
        </ul>
      </nav>
      <div className="w-full h-full overflow-scroll p-4">{children}</div>
    </main>
  );
}
