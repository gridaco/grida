import { ArchiveIcon } from "@radix-ui/react-icons";
import Link from "next/link";

export default function StoreGetStartedPage({
  params,
}: {
  params: { id: string };
}) {
  const form_id = params.id;
  return (
    <main className="h-full flex flex-col">
      <div className="h-hull flex-1 flex flex-col justify-center items-center gap-8">
        <ArchiveIcon className="opacity-80" width={80} height={80} />
        <div className="h-hull flex flex-col justify-center items-center">
          <h1 className="text-2xl font-bold">Add commerce to your forms</h1>
          <p className="text-sm opacity-80 text-center max-w-md mt-2">
            Create personalized store for your customers. Here you can manage
            your products, inventory, and orders.
          </p>
        </div>
        <footer>
          <form
            action={`/private/editor/connect/${form_id}/store/connection`}
            method="POST"
          >
            <button
              className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800"
              type="submit"
            >
              <span>Get started</span>
            </button>
          </form>
        </footer>
      </div>
    </main>
  );
}
