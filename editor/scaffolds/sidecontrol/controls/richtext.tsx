import { CMSRichText } from "@/components/formfield-cms";
import { Button } from "@/components/ui-editor/button";
import {
  Sheet,
  SheetHeader,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { SheetContent } from "@/components/ui/sheet-without-overlay";
import { Pencil2Icon } from "@radix-ui/react-icons";

export function RichTextControl({
  title,
  description,
  placeholder,
  value = { html: "" },
  onValueChange,
}: {
  title?: string;
  description?: string;
  placeholder?: string;
  value?: { html: string };
  onValueChange?: (value: { html: string }) => void;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="xs" className="w-full">
          <Pencil2Icon className="size-3.5 me-1" />
          Edit
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="h-full">
          <CMSRichText
            value={value.html}
            placeholder={placeholder}
            // uploader={() => {}} // TODO:
            onValueChange={(html) => {
              onValueChange?.({ html });
            }}
          />
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant={"outline"} size="sm" className="w-full">
              Close
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
