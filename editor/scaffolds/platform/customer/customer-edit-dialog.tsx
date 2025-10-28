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
import { Spinner } from "@/components/ui/spinner";
import { PhoneInput } from "@/components/extension/phone-input";
import { Textarea } from "@/components/ui/textarea";

export interface CustomerEditDialogDTO {
  name: string | null;
  email: string | null;
  phone: string | null;
  description: string | null;
}

const t_operation_action_label = {
  insert: "create",
  update: "update",
} as const;

export default function CustomerEditDialog({
  default: defaultValues = {
    name: "",
    email: "",
    phone: "",
    description: "",
  },
  operation,
  onSubmit,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  operation: "insert" | "update";
  default?: CustomerEditDialogDTO;
  onSubmit?: (data: CustomerEditDialogDTO) => Promise<boolean>;
}) {
  const {
    control,
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<CustomerEditDialogDTO>({
    defaultValues: defaultValues,
  });

  const t_action_label = t_operation_action_label[operation];

  const onFormSubmit = async (data: CustomerEditDialogDTO) => {
    // Transform falsy (empty) values to null.
    const transformedData: CustomerEditDialogDTO = {
      name: data.name?.trim() || null,
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
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
          <DialogTitle className="capitalize">
            {t_action_label} customer
          </DialogTitle>
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
          <Button
            form="create-customer"
            disabled={isSubmitting}
            className="capitalize"
          >
            {isSubmitting ? <Spinner /> : `${t_action_label} customer`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
