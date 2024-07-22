export default function XTablePage({
  params,
}: {
  params: {
    table: string;
  };
}) {
  const { table } = params;
  return (
    <main>
      <h1 className="text-2xl font-bold">{table}</h1>
    </main>
  );
}
