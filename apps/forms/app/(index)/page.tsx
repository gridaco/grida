import Image from "next/image";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col p-24">
      <header></header>
      <div>
        <h1 className="text-5xl font-black py-4">Grida Forms</h1>
        <p className="text-sm opacity-50">
          Grida Forms is a headless api-first forms builder for developers
        </p>
      </div>
    </main>
  );
}
