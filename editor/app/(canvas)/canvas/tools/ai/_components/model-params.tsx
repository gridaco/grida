import { Button } from "@app/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import { MaxTokensSelector } from "./maxtokens-selector";
import { TemperatureSelector } from "./temperature-selector";
import { TopPSelector } from "./top-p-selector";
import { Settings2 } from "lucide-react";

export function ModelParams() {
  return (
    <Popover>
      <PopoverTrigger>
        <Button
          variant="ghost"
          size="icon"
          role="combobox"
          aria-label="Load a preset..."
        >
          <Settings2 className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <TemperatureSelector defaultValue={[0.56]} />
        <MaxTokensSelector defaultValue={[256]} />
        <TopPSelector defaultValue={[0.9]} />
      </PopoverContent>
    </Popover>
  );
}
