export default async function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: { org: string };
}>) {
  return <>{children}</>;
}
