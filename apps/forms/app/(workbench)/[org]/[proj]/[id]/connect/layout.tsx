export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="flex flex-1">
      <div className="w-full h-full overflow-y-scroll p-4 pb-20">
        {children}
      </div>
    </main>
  );
}
