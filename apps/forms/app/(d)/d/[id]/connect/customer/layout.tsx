export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <article className="prose">{children}</article>;
}
