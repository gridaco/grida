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
      <nav
        className="col-span-1 md:col-span-2 lg:col-span-1 xl:col-span-1"
        style={{ minWidth: "300px" }}
      >
        <ul>
          <li>
            <Link href={`/d/${id}/share/link`}>
              <button>Share the link</button>
            </Link>
          </li>
          <li>
            <Link href={`/d/${id}/share/embed`}>
              <button>Embed in a webpage</button>
            </Link>
          </li>
          <li>
            <Link href={`/d/${id}/share/custom`}>
              <button>Use custom renderer</button>
            </Link>
          </li>
          <li>
            <Link href={`/d/${id}/share/api`}>
              <button>Use API</button>
            </Link>
          </li>
        </ul>
      </nav>
      {children}
    </main>
  );
}
