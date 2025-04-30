import LogsTable from "../_components/logs-table";

export default function Page() {
  return (
    <main className="container mx-auto my-10">
      <div className="w-full h-full">
        <header className="flex items-center gap-4 border-b py-4 mb-4">
          <h1 className="text-2xl font-bold tracking-tight">Obervability</h1>
        </header>
        <LogsTable />
      </div>
    </main>
  );
}
