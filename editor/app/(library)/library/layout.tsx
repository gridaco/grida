import React from "react";
import LibraryHeader from "./header";
import LibraryFooter from "./footer";

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div>
      <LibraryHeader />
      <main className="container max-w-screen-2xl mx-auto px-6 2xl:px-0">
        {children}
      </main>
      <LibraryFooter />
    </div>
  );
}
