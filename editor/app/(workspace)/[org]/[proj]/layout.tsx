import { WorkspaceShell } from "../_components/workspace-shell";

export default async function ProjectLayout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}>) {
  const { org } = await params;
  return <WorkspaceShell org={org}>{children}</WorkspaceShell>;
}
