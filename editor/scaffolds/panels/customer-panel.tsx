"use client";

import React from "react";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { FormCustomerDetail } from "@/app/(api)/private/editor/customers/[uid]/route";
import { fmt_local_index } from "@/utils/fmt";
import { Link2Icon } from "@radix-ui/react-icons";
import { Skeleton } from "@/components/ui/skeleton";
import { provisional } from "@/services/customer/utils";
import { useEditorState } from "../editor";
import type { Platform } from "@/lib/platform";
import useSWR from "swr";
import { cn } from "@/utils";

export function CustomerEditPanel({
  customer_id,
  ...props
}: React.ComponentProps<typeof Sheet> & {
  customer_id?: string;
}) {
  const [state] = useEditorState();
  const { organization, project } = state;

  const { data: customer } = useSWR<FormCustomerDetail>(
    customer_id ? `/private/editor/customers/${customer_id}` : undefined,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    }
  );

  return (
    <Sheet {...props}>
      <SheetContent className="overflow-y-scroll">
        <SheetHeader>
          {/* <SheetTitle>{title}</SheetTitle> */}
          {/* <SheetDescription></SheetDescription> */}
        </SheetHeader>
        <div className={cn("py-4", !customer ? "block" : "hidden")}>
          <Loading />
        </div>
        <div className={cn("grid gap-4 py-4", !customer && "hidden")}>
          <div className="grid grid-cols-4 items-center gap-4">
            <Avatar className="w-24 h-24">
              {/* <AvatarImage src="https://github.com/shadcn.png" /> */}
              <AvatarFallback className="font-mono font-bold">
                {customer ? avatar_txt(customer) : ""}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="uid" className="font-mono text-right">
              UID
            </Label>
            <Input
              id="uid"
              readOnly
              value={customer?.uid}
              className="font-mono col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="uuid" className="font-mono text-right">
              UUID
            </Label>
            <Input
              id="uuid"
              readOnly
              placeholder="Empty"
              value={customer?.uuid ?? undefined}
              className="font-mono col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">
              Email
            </Label>
            <Input
              id="email"
              readOnly
              placeholder="Empty"
              value={provisional(
                customer?.email,
                customer?.email_provisional
              ).join(", ")}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="phone" className="text-right">
              Phone
            </Label>
            <Input
              id="phone"
              readOnly
              placeholder="Empty"
              value={provisional(
                customer?.phone,
                customer?.phone_provisional
              ).join(", ")}
              className="col-span-3"
            />
          </div>
          <hr />
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="responses" className="text-right">
              Responses
            </Label>
            <div className="col-span-3">
              <ul>
                {customer?.responses.map((response) => (
                  <li
                    key={response.id}
                    className="flex items-center group border-b border-dashed hover:border-black"
                  >
                    <Link2Icon className="mr-2" />
                    {/* FIXME: form.id is not a valud route - migration */}
                    {/* <Link
                      href={`/${organization.name}/${project.name}/${response.form.id}`}
                    > */}
                    {response.form.title}
                    {/* </Link> */}
                    <span className="font-mono">
                      {fmt_local_index(response.local_index)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <hr />
        </div>
        <SheetFooter>
          {/* <SheetClose asChild>
            <Button>Close</Button>
          </SheetClose> */}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function avatar_txt(customer: Platform.Customer.Customer) {
  if (customer.email) {
    return customer.email.split("@")[0];
  }

  return "#" + customer.uid.split("").splice(0, 4).join("").toUpperCase();
}

function Loading() {
  return (
    <>
      <Skeleton className="h-24 w-24 rounded-full" />
      <div className="mt-10 flex flex-col gap-2">
        <Skeleton className="h-5" />
        <Skeleton className="h-5" />
        <Skeleton className="h-5" />
        <Skeleton className="h-5" />
      </div>
    </>
  );
}
