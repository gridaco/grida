import { createRoot } from "react-dom/client";
import { GridaLogo } from "../components/grida-logo";

const root = createRoot(document.body);

const Page = () => {
  return (
    <main className="flex flex-col min-h-screen bg-neutral-900 text-white select-none">
      <div className="h-10 w-full draggable" />
      <div className="flex-1 flex flex-col items-center justify-between p-8">
        <div className="my-10">
          <GridaLogo className="w-12 h-12 fill-white mx-auto" />
        </div>
        <div className="w-full flex flex-col gap-2">
          <button className="flex items-center justify-center w-full py-2 px-2 bg-white text-black rounded-md cursor-pointer">
            <span className="text-xs font-medium">Continue with Google</span>
          </button>
          <button className="flex items-center justify-center w-full py-2 px-2 text-white rounded-md cursor-pointer">
            <span className="text-xs font-medium">Log in</span>
          </button>
        </div>
      </div>
    </main>
  );
};

root.render(<Page />);
