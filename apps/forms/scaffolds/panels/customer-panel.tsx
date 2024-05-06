"use client";
import React from "react";

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
import type { Customer } from "@/types";

export function CustomerEditPanel({
  title,
  init,
  ...props
}: React.ComponentProps<typeof Sheet> & {
  title: React.ReactNode;
  init: Customer;
}) {
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
              <AvatarFallback>{avatar_txt(init)}</AvatarFallback>
            </Avatar>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="uid" className="text-right">
              UID
            </Label>
            <Input id="uid" readOnly value={init.uid} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="uuid" className="text-right">
              UUID
            </Label>
            <Input
              id="uuid"
              readOnly
              value={init.uuid ?? undefined}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">
              Email
            </Label>
            <Input
              id="email"
              readOnly
              value={init.email ?? undefined}
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
              value={init.phone ?? undefined}
              className="col-span-3"
            />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button>Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function avatar_txt(customer: Customer) {
  if (customer.email) {
    return customer.email.split("@")[0];
  }

  return customer.uid.split("").splice(0, 2).join("");
}
