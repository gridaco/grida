import { Siebar } from "@/scaffolds/sidebar/sidebar";

export default function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: { id: string };
}>) {
  const id = params.id;

  return (
    <div className="h-full flex flex-1 w-full">
      {/* side */}
      <aside className="hidden lg:flex h-full">
        <Siebar mode="data" />
      </aside>

      <div className="w-full h-full overflow-x-hidden">{children}</div>
    </div>
  );
}
