import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-white">
      <main className="max-w-2xl mx-auto text-center space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Grida File Viewer
        </h1>
        <p className="text-muted-foreground">
          This is a service provided by Grida. For more information about our
          products and services, please visit our main website.
        </p>
        <Link
          href="https://grida.co"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
        >
          Visit grida.co
        </Link>
      </main>
      <footer className="fixed bottom-0 w-full p-4 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Grida. All rights reserved.
      </footer>
    </div>
  );
}
