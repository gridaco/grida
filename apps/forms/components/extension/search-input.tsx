import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils";

export function SearchInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative ml-auto flex-1 md:grow-0">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search"
        className={cn("pl-8", className)}
        {...props}
      />
    </div>
  );
}
