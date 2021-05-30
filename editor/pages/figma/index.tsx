import React from "react";
import Link from "next/link";
export default function FigmaDemoIndexPage() {
  return (
    <div style={{ padding: 24 }}>
      <p>
        In order to develop design to code from figma, you'll need to set figma
        personal access token via
        <br />
        <Link href="/preferences/access-tokens">Preferences</Link>
      </p>
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
