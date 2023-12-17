import React from "react";
import Link from "next/link";
export default function FigmaDemoIndexPage() {
  return (
    <div style={{ padding: 24 }}>
      <Link href="./figma/to-flutter">Flutter demo</Link>
      <br />
      <Link href="./figma/to-react">React demo</Link>
      <br />
      <Link href="./figma/to-reflect">Figma To Reflect Design Nodes</Link>
      <br />
      <Link href="./figma/to-token">Figma design to Reflect Widget Tokens</Link>
    </div>
  );
}
