"use client";

import { Input } from "@/components/ui/input";
import { createClientFormsClient } from "@/lib/supabase/client";
import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";

export function EditableFormTitle({
  form_id,
  defaultValue,
}: {
  form_id: string;
  defaultValue?: string;
}) {
  const [value, setValue] = useState<string>(defaultValue || "");

  const supabase = createClientFormsClient();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const updateTitle = useCallback(
    debounce(async (newValue: string) => {
      const { error } = await supabase
        .from("form")
        .update({ title: newValue })
        .eq("id", form_id);

      if (error) {
        toast.error("Failed to save");
      } else {
        toast.success("Saved");
      }
    }, 1000),

    [form_id, supabase]
  );

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setValue(value);
  };

  useEffect(() => {
    if (value !== defaultValue) {
      updateTitle(value);
    }
  }, [defaultValue, value, updateTitle]);

  return (
    <>
      <Input
        type="text"
        placeholder="Form title"
        value={value}
        onChange={onChange}
      />
    </>
  );
}

function debounce<F extends (...args: any[]) => void>(
  func: F,
  wait: number
): (...args: Parameters<F>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return function (...args: Parameters<F>): void {
    const later = () => {
      timeout = null;
      func(...args);
    };
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}
