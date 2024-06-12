import { GridaLogo } from "@/components/grida-logo";

const mock = {
  project_name: "Project Name",
};

export default function CustomerPortalSession() {
  const { project_name } = mock;

  return (
    <main className="flex min-h-screen">
      <aside className="flex flex-col p-10 bg-primary text-primary-foreground">
        <header>{project_name}</header>
        <div className="flex-1" />
        <div>
          <span className="text-xs">Powered by</span>
          <span className="ml-2">
            <GridaLogo size={15} className="fill-white" />
          </span>
        </div>
      </aside>
      <aside className="p-10 flex-1">
        <section>Responses</section>
        <section>In-Progress</section>
      </aside>
    </main>
  );
}
