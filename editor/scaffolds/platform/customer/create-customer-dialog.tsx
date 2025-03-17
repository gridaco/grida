"use client";

import React from "react";
import { Controller, useForm } from "react-hook-form";
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
import { PhoneInput } from "@/components/extension/phone-input";
import { Textarea } from "@/components/ui/textarea";

interface CreateCustomerInsert {
  name: string | null;
  email: string | null;
  phone: string | null;
  description: string | null;
}

export default function CreateCustomerDialog({
  onSubmit,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  onSubmit?: (data: CreateCustomerInsert) => Promise<boolean>;
}) {
  const {
    control,
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<CreateCustomerInsert>({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      description: "",
    },
  });

  const onFormSubmit = async (data: CreateCustomerInsert) => {
    // Transform falsy (empty) values to null.
    const transformedData: CreateCustomerInsert = {
      name: data.name?.trim() || null,
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      description: data.description?.trim() || null,
    };

    console.log("Create customer form submitted with data:", transformedData);

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
                min={5}
                max={255}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Account Phone Number</Label>
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <PhoneInput {...field} value={field.value as any} />
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...register("description")}
                maxLength={400}
              />
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
