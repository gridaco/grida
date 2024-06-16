import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useFormAgentState } from "@/lib/formstate";
import { GridaSupabase } from "@/types";
import { Search } from "lucide-react";
import useSWR from "swr";

function SearchInput() {
  return (
    <div className="relative ml-auto flex-1 md:grow-0">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search..."
        className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[320px]"
      />
    </div>
  );
}

export function ReferenceSearchPreview() {
  return <SearchInput />;
}
export function ReferenceSearch({ id }: { id: string }) {
  const [state] = useFormAgentState();

  const res = useSWR<{ data: { users: GridaSupabase.SupabaseUser[] } }>(
    `/v1/session/${state.session_id}/field/${id}/search`,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    }
  );

  return (
    <Sheet>
      <SheetTrigger>
        <SearchInput />
      </SheetTrigger>
      <SheetContent className="xl:w-[800px] xl:max-w-none sm:w-[500px] sm:max-w-none w-screen max-w-none">
        <SheetHeader>
          <SheetTitle>
            Select a record to reference from <code>...</code>
          </SheetTitle>
          <SheetDescription>...</SheetDescription>
        </SheetHeader>
        <div>
          {res.data?.data?.users?.map((user) => (
            <div key={user.id}>
              <p>{user.email}</p>
            </div>
          ))}
        </div>
        <SheetFooter>
          <SheetClose>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
