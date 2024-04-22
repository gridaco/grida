import { fmt_hashed_local_id } from "@/utils/fmt";
import i18next from "i18next";

const mock = {
  title: "ACME Form Title",
  local_id: 123,
} as const;

export default function Component({
  searchParams,
}: {
  searchParams: {
    title?: string;
  };
}) {
  const title = searchParams.title || mock.title;
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 py-12">
      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg w-full max-w-md px-8 py-12">
        <div className="flex flex-col items-center">
          <div className="text-6xl font-bold text-blue-700 mb-4">
            {fmt_hashed_local_id(mock.local_id)}
          </div>
          <h2 className="text-2xl font-bold mb-4">
            {i18next.t("formcomplete.receipt01.title")} - {title}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-center mb-6">
            {i18next.t("formcomplete.receipt01.description")}
          </p>
        </div>
      </div>
    </div>
  );
}
