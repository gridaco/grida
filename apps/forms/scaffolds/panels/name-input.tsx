"use client";
import React, { useEffect } from "react";
import { Link1Icon, PersonIcon, PlusIcon } from "@radix-ui/react-icons";
import { Command as CommandPrimitive } from "cmdk";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useState } from "react";
import { useEditorState } from "../editor";
import { SupabaseLogo } from "@/components/logos";
import { SYSTEM_GF_CUSTOMER_UUID_KEY } from "@/k/system";
import { cn } from "@/utils";
import { PrivateEditorApi } from "@/lib/private";
import { GridaSupabase } from "@/types";

const Input = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  </div>
));

Input.displayName = "CommandInput";

export function NameInput({}: {}) {
  const [state] = useEditorState();
  const [value, setValue] = useState<string>("");

  const [tableSchema, setTableSchema] = useState<
    GridaSupabase.SupabaseTable["sb_table_schema"] | undefined
  >();

  useEffect(() => {
    if (state.connections.supabase) {
      PrivateEditorApi.SupabaseConnection.getConnectionTable(
        state.form_id
      ).then(({ data }) => {
        setTableSchema(data.data.sb_table_schema);
      });
    }
  }, [state.form_id, state.connections.supabase]);

  return (
    <Command className="rounded-lg border">
      <Input placeholder="field_name" value={value} onValueChange={setValue} />
      <CommandList>
        {value && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Reserved">
              <CommandItem>
                <PersonIcon className="mr-2 h-4 w-4" />
                <span>{SYSTEM_GF_CUSTOMER_UUID_KEY}</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            {state.connections.supabase && (
              <CommandGroup
                heading={
                  <>
                    <SupabaseLogo className="inline w-4 h-4 me-1 align-middle" />{" "}
                    Supabase
                  </>
                }
              >
                {Object.keys(tableSchema?.properties ?? {}).map((key) => {
                  // const property = tableSchema?.properties[key];
                  return (
                    <CommandItem key={key}>
                      <Link1Icon className="mr-2 h-4 w-4" />
                      <span>{key}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            <CommandSeparator />
            <CommandItem>
              <PlusIcon className="mr-2 h-4 w-4" />
              <span>{value}</span>
            </CommandItem>
          </>
        )}
      </CommandList>
    </Command>
  );
}
