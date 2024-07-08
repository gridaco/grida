import { GridaLogo } from "@/components/grida-logo";

export function PoweredByGridaWaterMark() {
  return (
    <div className="flex items-center">
      <span className="text-xs">Powered by</span>
      <span className="ml-2">
        <GridaLogo size={15} />
      </span>
    </div>
  );
}
