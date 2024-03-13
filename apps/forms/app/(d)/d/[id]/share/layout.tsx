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
    <main className="grid grid-cols-1 gap-4 mt-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {/* side */}
      <nav className="col-span-1 md:col-span-2 lg:col-span-1 xl:col-span-1 max-w-xs min-w-60 w-min">
        <ul className="flex flex-col gap-2">
          <li>
            <Link href={`/d/${id}/share/link`}>
              <button className="w-full text-left px-4 py-2 rounded bg-transparent hover:bg-neutral-500/10">
                Share the link
              </button>
            </Link>
          </li>
          <li>
            <Link href={`/d/${id}/share/embed`}>
              <button className="w-full text-left px-4 py-2 rounded bg-transparent hover:bg-neutral-500/10">
                Embed in a webpage
              </button>
            </Link>
          </li>
          <li>
            <Link href={`/d/${id}/share/custom`}>
              <button className="w-full text-left px-4 py-2 rounded bg-transparent hover:bg-neutral-500/10">
                Use custom renderer
              </button>
            </Link>
          </li>
          <li>
            <Link href={`/d/${id}/share/api`}>
              <button className="w-full text-left px-4 py-2 rounded bg-transparent hover:bg-neutral-500/10">
                Use API
              </button>
            </Link>
          </li>
        </ul>
      </nav>
      {children}
    </main>
  );
}
