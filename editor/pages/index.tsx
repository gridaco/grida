import Link from "next/link";

export default function Home() {
  return (
    <div style={{ padding: 24 }}>
      <Link href="/figma">from figma</Link>
      <br />
      <br />
      <Link href="/preferences">Preferences (set access token)</Link>
    </div>
  );
}
