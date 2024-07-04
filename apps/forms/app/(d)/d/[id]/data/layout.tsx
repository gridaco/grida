export default function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: { id: string };
}>) {
  const id = params.id;

  return <main className="h-full flex flex-1 w-full">{children}</main>;
}
