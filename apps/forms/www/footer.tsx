import { GridaLogo } from "@/components/grida-logo";

export default function Footer() {
  return (
    <footer className="mx-auto mt-32 w-full max-w-container px-4 sm:px-6 lg:px-8">
      <div className="border-t border-neutral-400 border-opacity-25 py-10">
        <div className="pt-8 flex flex-col items-center gap-7">
          <GridaLogo />
        </div>
      </div>
      <p className="mt-1 text-center text-sm leading-6 text-current">
        Grida Inc. All rights reserved.
      </p>
      <div className="mt-20 mb-16 flex items-center justify-center text-sm leading-6 text-neutral-500">
        Privacy policy
        <div className="h-4 w-px mx-4 bg-neutral-400 opacity-25"></div>
        <p>Changelog</p>
      </div>
    </footer>
  );
}
