export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <article className="prose pb-20">{children}</article>;
}
