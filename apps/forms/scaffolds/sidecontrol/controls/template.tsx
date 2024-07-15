import { TemplateComponents } from "@/builder/template-builder";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import React, { useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/utils";

export function TemplateControl({
  value,
  onValueChange,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [selection, setSelection] = React.useState<string | undefined>(value);

  useEffect(() => {
    setSelection(value);
  }, [value]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={
          "flex justify-start max-h-96 min-w-[8rem] w-full overflow-hidden text-ellipsis"
        }
        onClick={() => setOpen(true)}
      >
        {value ? value : "Select a template"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-screen-xl p-0">
          <DialogHeader className="p-4">
            <DialogTitle>Browse Templates</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[80vh]">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10 p-4">
              {Object.keys(TemplateComponents.components)
                .filter((k) => k.startsWith("templates/"))
                .map((key: string) => {
                  return (
                    <TemplateCard
                      key={key}
                      value={key}
                      selected={selection === key}
                      onClick={() => {
                        setSelection(key);
                      }}
                      onDoubleClick={() => {
                        onValueChange?.(key);
                        setOpen(false);
                      }}
                    >
                      {React.createElement(TemplateComponents.components[key], {
                        // TODO: needs to be dynamic
                        properties: {
                          media: {
                            $id: "media",
                            type: "image",
                            src: "/images/abstract-placeholder.jpg",
                          },
                          h1: "Title",
                          badge: "Badge",
                          tags: ["Tag1", "Tag2"],
                          p: "Content",
                          n: 100,
                          date1: new Date().toLocaleDateString(),
                          date2: new Date().toLocaleDateString(),
                        },
                      })}
                    </TemplateCard>
                  );
                })}
            </div>
          </ScrollArea>
          <DialogFooter className="p-4">
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button
                disabled={!selection}
                onClick={() => {
                  onValueChange?.(selection!);
                }}
              >
                Use
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TemplateCard({
  value,
  selected,
  children,
  onClick,
  onDoubleClick,
}: React.PropsWithChildren<{
  value: string;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}>) {
  return (
    <div>
      <div
        className="group flex flex-col gap-2 cursor-pointer"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <div
          className={cn(
            "border rounded p-4 group-hover:border-accent-foreground",
            selected && "bg-accent"
          )}
        >
          {children}
        </div>
        <div className="text-xs text-muted-foreground group-hover:text-accent-foreground">
          {value}
        </div>
      </div>
    </div>
  );
}
