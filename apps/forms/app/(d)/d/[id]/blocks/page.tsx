import BlocksEditor from "@/scaffolds/blocks-editor";

export default async function EditFormPage() {
  return (
    <main className="py-4 px-8 md:py-10 md:px-16 container mx-auto max-w-screen-lg">
      <BlocksEditor />
      <div
        style={{
          height: 100,
        }}
      />
    </main>
  );
}
