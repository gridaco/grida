"use client";
import React, { useEffect } from "react";
import { Link1Icon, PersonIcon, PlusIcon } from "@radix-ui/react-icons";
import { Command as CommandPrimitive } from "cmdk";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useState } from "react";
import { useDatagridTable, useEditorState } from "../editor";
import { SupabaseLogo } from "@/components/logos";
import {
  SYSTEM_GF_CUSTOMER_UUID_KEY,
  SYSTEM_GF_CUSTOMER_EMAIL_KEY,
  SYSTEM_GF_CUSTOMER_PHONE_KEY,
  SYSTEM_GF_CUSTOMER_NAME_KEY,
} from "@/k/system";
import { cn } from "@/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { GridaXSupabase } from "@/types";

const CommandInput = React.forwardRef<
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

CommandInput.displayName = "CommandInput";

export function NameInput({
  autoFocus,
  value,
  onValueChange,
}: {
  autoFocus?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const tb = useDatagridTable();

  const x_sb_main_table_connection = tb
    ? "x_sb_main_table_connection" in tb
      ? tb.x_sb_main_table_connection
      : null
    : null;

  const inputref = React.useRef<React.ElementRef<
    typeof CommandPrimitive.Input
  > | null>(null);
  const commandinputref = React.useRef<React.ElementRef<
    typeof CommandPrimitive.Input
  > | null>(null);

  const [state] = useEditorState();
  const [open, setOpen] = useState<boolean>(false);
  const [focus, setFocus] = useState<boolean>(false);

  useEffect(() => {
    setOpen(focus && !!value);
  }, [value, focus]);

  useEffect(() => {
    if (!open && !value) {
      inputref.current?.focus();
    }
  }, [value, open]);

  const onSelect = (val: string) => {
    onValueChange?.(val);
    setOpen(false);
    setFocus(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger disabled className="w-full">
        <Input
          required
          autoFocus={autoFocus}
          ref={inputref}
          placeholder="field_name"
          value={value}
          className="w-full"
          onChange={(e) => {
            onValueChange?.(e.target.value);
          }}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onKeyDown={(e) => {
            // open on keydown (arrow down)
            if (e.key === "ArrowDown") {
              setOpen(true);
            }
          }}
        />
      </PopoverTrigger>
      <PopoverContent
        sideOffset={-40}
        className="w-[--radix-popover-trigger-width] max-h-[--radix-popover-content-available-height] p-0"
      >
        <Command>
          <CommandInput
            ref={commandinputref}
            placeholder="field_name"
            value={value}
            onValueChange={onValueChange}
            onFocusCapture={(event) => {
              setFocus(true);

              // cursor at the end
              setTimeout(() => {
                const length = event.target.value.length;
                event.target.setSelectionRange(length, length);
              }, 0);
            }}
            onBlur={() => setFocus(false)}
          />
          <CommandList>
            <>
              {value && (
                <>
                  <CommandGroup>
                    <CommandItem key={"current"} onSelect={onSelect}>
                      <PlusIcon className="mr-2 h-4 w-4" />
                      <span>{value}</span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
              <CommandSeparator />
              <CommandGroup heading="System">
                {[
                  SYSTEM_GF_CUSTOMER_UUID_KEY,
                  SYSTEM_GF_CUSTOMER_EMAIL_KEY,
                  SYSTEM_GF_CUSTOMER_PHONE_KEY,
                  SYSTEM_GF_CUSTOMER_NAME_KEY,
                ].map((key) => (
                  <CommandItem key={key} onSelect={onSelect}>
                    <PersonIcon className="mr-2 h-4 w-4" />
                    <span>{key}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {x_sb_main_table_connection && (
                <>
                  <CommandSeparator />
                  <CommandGroup
                    heading={
                      <>
                        <SupabaseLogo className="inline w-4 h-4 me-1 align-middle" />{" "}
                        Supabase{" "}
                        <code className="ms-2 text-xs font-mono text-muted-foreground">
                          {x_sb_main_table_connection.sb_schema_name as string}.
                          {x_sb_main_table_connection.sb_table_name}
                        </code>
                      </>
                    }
                  >
                    {Object.keys(
                      x_sb_main_table_connection?.definition?.properties ?? {}
                    ).map((key) => {
                      const property =
                        x_sb_main_table_connection?.definition?.properties[key];

                      const keywords = [
                        x_sb_main_table_connection?.sb_schema_name as string,
                        x_sb_main_table_connection?.sb_table_name as string,
                      ].filter(Boolean) as string[];

                      return (
                        <CommandItem
                          key={key}
                          keywords={keywords}
                          value={key}
                          onSelect={onSelect}
                        >
                          <Link1Icon className="mr-2 h-4 w-4" />
                          <span>{key}</span>{" "}
                          <small className="ms-1 text-muted-foreground">
                            {property?.type} | {property?.format}
                          </small>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                  {/* <CommandSeparator /> */}
                  {/* <XSupabaseAuthUsersTableProperties/> */}
                </>
              )}
            </>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function XSupabaseAuthUsersTableProperties({
  onSelect,
}: {
  onSelect?: (value: string) => void;
}) {
  return (
    <>
      <CommandGroup
        heading={
          <>
            <SupabaseLogo className="inline w-4 h-4 me-1 align-middle" />{" "}
            Supabase{" "}
            <code className="ms-2 text-xs font-mono text-muted-foreground">
              auth.users
            </code>
          </>
        }
      >
        {Object.keys(GridaXSupabase.SupabaseUserJsonSchema.properties).map(
          (key) => {
            const property =
              GridaXSupabase.SupabaseUserJsonSchema.properties[
                key as keyof typeof GridaXSupabase.SupabaseUserJsonSchema.properties
              ];

            const keywords = ["auth", "users"].filter(Boolean) as string[];

            const column = `auth.users.${key}`;

            return (
              <CommandItem
                key={key}
                keywords={keywords}
                value={column}
                onSelect={onSelect}
              >
                <Link1Icon className="mr-2 h-4 w-4" />
                <span>{key}</span>{" "}
                <small className="ms-1 text-muted-foreground">
                  {property?.type} | {property?.format}
                </small>
              </CommandItem>
            );
          }
        )}
      </CommandGroup>
    </>
  );
}
