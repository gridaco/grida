import React from "react";
import Link from "next/link";
export default function FigmaDemoIndexPage() {
  return (
    <>
      <p>
        In order to develop design to code from figma, you'll need to set figma
        personal access token via
        <br />
        <Link href="/preferences/access-tokens">Preferences</Link>
      </p>
      <Link href="./figma/to-flutter">Flutter demo</Link>
      <br />
      <Link href="./figma/to-react">React demo</Link>
    </>
  );
}
