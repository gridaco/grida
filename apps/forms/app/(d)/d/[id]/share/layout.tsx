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
    <main>
      <nav>
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
