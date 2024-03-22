import { GridaLogo } from "@/components/grida-logo";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="py-10 w-max mx-auto">
      <Link href={"/"} target="_blank">
        <PoweredByWaterMark />
      </Link>
    </footer>
  );
}

function PoweredByWaterMark() {
  return (
    <div className="flex items-center opacity-50">
      <span className="text-xs">Powered by</span>
      <span className="ml-2">
        <GridaLogo size={15} />
      </span>
    </div>
  );
}
