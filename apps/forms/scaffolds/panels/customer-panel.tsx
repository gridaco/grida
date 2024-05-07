"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Customer, FormResponse } from "@/types";
import useSWR from "swr";
import { FormCustomerDetail } from "@/app/(api)/private/editor/customers/[uid]/route";
import { fmt_hashed_local_id } from "@/utils/fmt";
import Link from "next/link";
import { Link1Icon, Link2Icon } from "@radix-ui/react-icons";

export function CustomerEditPanel({
  title,
  customer_id,
  ...props
}: React.ComponentProps<typeof Sheet> & {
  title: React.ReactNode;
  customer_id: string;
}) {
  const { data: customer } = useSWR<FormCustomerDetail>(
    `/private/editor/customers/${customer_id}`,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    }
  );

  return (
    <Sheet {...props}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{/* // */}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
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
              value={customer?.email ?? undefined}
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
              value={customer?.phone ?? undefined}
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
                    <Link href={`/d/${response.form.id}`}>
                      {response.form.title}
                    </Link>
                    <span className="font-mono">
                      {fmt_hashed_local_id(response.local_id)}
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

function avatar_txt(customer: Customer) {
  if (customer.email) {
    return customer.email.split("@")[0];
  }

  return "#" + customer.uid.split("").splice(0, 4).join("").toUpperCase();
}
