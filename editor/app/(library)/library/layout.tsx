import React from "react";
import LibraryHeader from "./_components/header";
import LibraryFooter from "./_components/footer";

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div>
      <LibraryHeader />
      <main className="container max-w-screen-2xl mx-auto px-2 md:px-6 2xl:px-2">
        {children}
      </main>
      <LibraryFooter />
    </div>
  );
}
