export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="max-w-2xl mx-auto">
      <article className="prose dark:prose-invert pb-20">{children}</article>;
    </main>
  );
}
