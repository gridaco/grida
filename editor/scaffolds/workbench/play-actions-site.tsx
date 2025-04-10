import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ClockIcon, GlobeIcon, PlayIcon } from "@radix-ui/react-icons";
import Link from "next/link";

export function SitePlayAction() {
  const link = "https://dummy-fixme.grida.site";

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            Publish
          </Button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="grid gap-4">
          <div className="grid gap-2">
            <Link href={link} target="_blank">
              <div className="flex items-center space-x-2">
                <GlobeIcon className="size-3.5" />
                <span className="text-xs">dummy-replace-me.grida.site</span>
              </div>
            </Link>
            <div className="flex items-center space-x-2">
              <ClockIcon className="size-3.5" />
              <span className="text-xs">1h ago</span>
            </div>
          </div>
          <Button className="w-full" size="sm" disabled>
            Update
          </Button>
        </PopoverContent>
      </Popover>
    </>
  );
}
