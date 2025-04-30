"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { TagFormDialog } from "./tag-form-dialog";

export function CreateTagButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Create Tag
      </Button>
      <TagFormDialog
        open={open}
        onOpenChange={setOpen}
        title="Create Tag"
        description="Add a new tag to organize your customers."
        submitLabel="Create"
      />
    </>
  );
}
