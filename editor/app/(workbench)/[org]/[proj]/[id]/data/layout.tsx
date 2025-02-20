import React from "react";

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <main className="h-full flex flex-1 w-full">{children}</main>;
}
