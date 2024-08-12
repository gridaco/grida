import React from "react";

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="w-full h-full overflow-y-scroll p-4 pb-20">{children}</div>
  );
}
