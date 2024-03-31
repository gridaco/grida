import "../globals.css";

export const metadata = {
  title: "Grida Forms Themes Collection",
  description: "Embeddable Themes CDN directory for Grida Forms",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
