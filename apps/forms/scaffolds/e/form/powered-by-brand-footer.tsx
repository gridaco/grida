import { PoweredByGridaWaterMark } from "@/components/powered-by-branding";
import Link from "next/link";

export function PoweredByGridaFooter() {
  return (
    <footer className="py-10 w-max mx-auto">
      <Link href={"/"} target="_blank">
        <PoweredByGridaWaterMark />
      </Link>
    </footer>
  );
}
