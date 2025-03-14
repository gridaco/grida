"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/spinner";

interface CreateCustomerInsert {
  name: string | null;
  email: string | null;
  description: string | null;
}

export default function CreateCustomerDialog({
  onSubmit,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  onSubmit?: (data: CreateCustomerInsert) => Promise<boolean>;
}) {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<CreateCustomerInsert>({
    defaultValues: {
      name: "",
      email: "",
      description: "",
    },
  });

  const onFormSubmit = async (data: CreateCustomerInsert) => {
    // Transform falsy (empty) values to null.
    const transformedData: CreateCustomerInsert = {
      name: data.name?.trim() || null,
      email: data.email?.trim() || null,
      description: data.description?.trim() || null,
    };

    await onSubmit?.(transformedData).then((success) => {
      if (success) props.onOpenChange?.(false);
    });
  };

  return (
    <Dialog {...props}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Create customer</DialogTitle>
        </DialogHeader>
        <form
          id="create-customer"
          onSubmit={handleSubmit(onFormSubmit)}
          className="space-y-6"
        >
          <div>
            <h3 className="text-lg font-medium">Account information</h3>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="John Doe"
                {...register("name")}
                max={255}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Account email</Label>
              <Input
                id="email"
                type="email"
                placeholder="alice@acme.com"
                pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,4}$"
                {...register("email")}
                max={255}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" {...register("description")} max={400} />
            </div>
          </div>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isSubmitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button form="create-customer" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : "Add customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
