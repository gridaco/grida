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
      <div className="w-full h-full overflow-y-scroll p-4 pb-20">
        {children}
      </div>
    </main>
  );
}
