import type { Metadata } from "next";
import Header from "@/www/header";
import Footer from "@/www/footer";
import ServerSecretGeneratorTool from "./_page";

export const metadata: Metadata = {
  title: "Keygen (Server Secret Generator)",
  description:
    "Generate secure server secrets locally: S2S API keys, webhook signing secrets, JWT keys, session secrets, encryption keys, and PKCE.",
  keywords:
    "keygen, server secret generator, s2s api key, webhook signing secret, jwt secret, session secret, aes-256-gcm key, xchacha20-poly1305 key, pkce",
  category: "Developer Tools",
  openGraph: {
    title: "Keygen (Server Secret Generator)",
    description:
      "Generate secure server secrets locally: S2S API keys, webhook signing secrets, JWT keys, session secrets, encryption keys, and PKCE.",
    type: "website",
    url: "https://grida.co/tools/keygen",
  },
};

export default function KeygenToolPage() {
  return (
    <main>
      <Header />
      <ServerSecretGeneratorTool />
      <Footer />
    </main>
  );
}
