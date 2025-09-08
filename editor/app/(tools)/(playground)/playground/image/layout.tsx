import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Image Playground",
  description: "Playground for generating images",
};

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
