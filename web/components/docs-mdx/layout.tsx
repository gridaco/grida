import Meta from "./meta";

export default function Layout({ preview, children }) {
  return (
    <>
      <Meta />
      <div>
        <main>{children}</main>
      </div>
    </>
  );
}
