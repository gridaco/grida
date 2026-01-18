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
import { Spinner } from "@/components/ui/spinner";
import { PhoneInput } from "@/components/extension/phone-input";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/tag";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";

export interface CustomerContactsEditDialogDTO {
  name: string | null;
  email: string | null;
  phone: string | null;
  description: string | null;
}

export interface CustomerCreateDialogDTO extends CustomerContactsEditDialogDTO {
  tags: string[];
}

export function CustomerCreateDialog({
  default: defaultValues = {
    name: "",
    email: "",
    phone: "",
    description: "",
    tags: [],
  },
  onSubmit,
  tagOptions,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  default?: CustomerContactsEditDialogDTO & { tags?: string[] };
  onSubmit?: (data: CustomerCreateDialogDTO) => Promise<boolean>;
  /**
   * Autocomplete options (tag names). Freeform tags are still allowed.
   */
  tagOptions?: string[];
}) {
  const {
    control,
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<CustomerContactsEditDialogDTO>({
    defaultValues: {
      name: defaultValues.name ?? "",
      email: defaultValues.email ?? "",
      phone: defaultValues.phone ?? "",
      description: defaultValues.description ?? "",
    },
  });

  const [activeTagIndex, setActiveTagIndex] = React.useState<number | null>(
    null
  );
  const [tags, setTags] = React.useState<{ id: string; text: string }[]>(() =>
    (defaultValues.tags ?? []).map((t) => ({ id: t, text: t }))
  );

  const onFormSubmit = async (data: CustomerContactsEditDialogDTO) => {
    // Transform falsy (empty) values to null.
    const transformedData: CustomerCreateDialogDTO = {
      name: data.name?.trim() || null,
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      description: data.description?.trim() || null,
      tags: tags.map((t) => t.text.trim()).filter((t) => t.length > 0),
    };

    await onSubmit?.(transformedData).then((success) => {
      if (success) props.onOpenChange?.(false);
    });
  };

  return (
    <Dialog {...props}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="capitalize">create customer</DialogTitle>
        </DialogHeader>
        <form
          id="customer-create-form"
          onSubmit={handleSubmit(onFormSubmit)}
          className="w-full"
        >
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Account information</FieldLegend>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="customer-create-name">Name</FieldLabel>
                  <Input
                    id="customer-create-name"
                    placeholder="John Doe"
                    {...register("name")}
                    max={255}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-create-email">
                    Account email
                  </FieldLabel>
                  <Input
                    id="customer-create-email"
                    type="email"
                    placeholder="alice@acme.com"
                    pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,4}$"
                    {...register("email")}
                    min={5}
                    max={255}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-create-phone">
                    Account Phone Number
                  </FieldLabel>
                  <Controller
                    name="phone"
                    control={control}
                    render={({ field }) => (
                      <PhoneInput
                        id="customer-create-phone"
                        {...field}
                        value={field.value as any}
                      />
                    )}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-create-description">
                    Description
                  </FieldLabel>
                  <Textarea
                    id="customer-create-description"
                    {...register("description")}
                    maxLength={400}
                  />
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Tags</FieldLegend>
              <FieldDescription>
                Add tags to organize and filter customers later.
              </FieldDescription>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="customer-create-tags">
                    Customer tags
                  </FieldLabel>
                  <TagInput
                    id="customer-create-tags"
                    tags={tags}
                    setTags={setTags}
                    activeTagIndex={activeTagIndex}
                    setActiveTagIndex={setActiveTagIndex}
                    enableAutocomplete={(tagOptions?.length ?? 0) > 0}
                    autocompleteOptions={tagOptions?.map((t) => ({
                      id: t,
                      text: t,
                    }))}
                    placeholder="Add tags"
                  />
                </Field>
              </FieldGroup>
            </FieldSet>
          </FieldGroup>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isSubmitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            form="customer-create-form"
            disabled={isSubmitting}
            className="capitalize"
          >
            {isSubmitting ? <Spinner /> : "create customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CustomerContactsEditDialog({
  default: defaultValues = {
    name: "",
    email: "",
    phone: "",
    description: "",
  },
  onSubmit,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  default?: CustomerContactsEditDialogDTO;
  onSubmit?: (data: CustomerContactsEditDialogDTO) => Promise<boolean>;
}) {
  const {
    control,
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<CustomerContactsEditDialogDTO>({
    defaultValues: defaultValues,
  });

  const onFormSubmit = async (data: CustomerContactsEditDialogDTO) => {
    // Transform falsy (empty) values to null.
    const transformedData: CustomerContactsEditDialogDTO = {
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
            Edit contact information
          </DialogTitle>
        </DialogHeader>
        <form
          id="customer-contacts-edit-form"
          onSubmit={handleSubmit(onFormSubmit)}
          className="w-full"
        >
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Account information</FieldLegend>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="customer-contacts-name">Name</FieldLabel>
                  <Input
                    id="customer-contacts-name"
                    placeholder="John Doe"
                    {...register("name")}
                    max={255}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-contacts-email">
                    Account email
                  </FieldLabel>
                  <Input
                    id="customer-contacts-email"
                    type="email"
                    placeholder="alice@acme.com"
                    pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,4}$"
                    {...register("email")}
                    min={5}
                    max={255}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-contacts-phone">
                    Account Phone Number
                  </FieldLabel>
                  <Controller
                    name="phone"
                    control={control}
                    render={({ field }) => (
                      <PhoneInput
                        id="customer-contacts-phone"
                        {...field}
                        value={field.value as any}
                      />
                    )}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-contacts-description">
                    Description
                  </FieldLabel>
                  <Textarea
                    id="customer-contacts-description"
                    {...register("description")}
                    maxLength={400}
                  />
                </Field>
              </FieldGroup>
            </FieldSet>
          </FieldGroup>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isSubmitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            form="customer-contacts-edit-form"
            disabled={isSubmitting}
            className="capitalize"
          >
            {isSubmitting ? <Spinner /> : "save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CustomerCreateDialog;
