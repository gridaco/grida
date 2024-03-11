export default function FormPage({ params }: { params: { id: string } }) {
  const id = params.id;

  return (
    <main>
      <h1>Form</h1>
      <p>{params.id}</p>
    </main>
  );
}
