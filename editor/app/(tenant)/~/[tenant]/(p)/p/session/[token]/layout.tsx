import type { ReactNode } from "react";
import PortalSessionTouchBoundary from "./portal-session-touch-boundary";

type Params = {
  token: string;
};

export default async function CustomerPortalSessionLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<Params>;
}) {
  const { token } = await params;

  return (
    <>
      <PortalSessionTouchBoundary token={token} />
      {children}
    </>
  );
}
