"use client";

import React from "react";
import type { FormFieldDefinition } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";

type ErrorViewProps = {
  code: string;
  message?: string;
  missing_required_hidden_fields?: FormFieldDefinition[];
};

export function FormPageDeveloperError({
  code,
  message,
  missing_required_hidden_fields,
}: ErrorViewProps) {
  return (
    <main className="font-mono p-8 prose">
      <header>
        <h1 className="text-2xl font-bold">
          Developer Error: <code>{code}</code>{" "}
        </h1>
      </header>
      <p>{message}</p>
      {missing_required_hidden_fields && (
        <>
          <p>Missing required hidden fields:</p>
          <ul>
            {missing_required_hidden_fields.map((m) => (
              <li key={m.name}>{m.name}</li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

export function FormPageDeveloperErrorDialog({
  code,
  message,
  missing_required_hidden_fields,
}: ErrorViewProps) {
  return (
    <Dialog>
      <DialogTrigger>
        <Button variant="destructive" size="icon">
          <ExclamationTriangleIcon color="white" className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <code>{code}</code>
          </DialogTitle>
          <DialogDescription className="prose">
            {message}
            <br />
            {missing_required_hidden_fields && (
              <>
                <p>Missing required hidden fields:</p>
                <ul>
                  {missing_required_hidden_fields.map((m) => (
                    <li key={m.name}>{m.name}</li>
                  ))}
                </ul>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
