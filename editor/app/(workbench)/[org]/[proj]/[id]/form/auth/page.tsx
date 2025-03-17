"use client";

// TODO: not ready

import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { OpenInNewWindowIcon } from "@radix-ui/react-icons";
import { editorlink } from "@/lib/forms/url";
import { useEditorState } from "@/scaffolds/editor";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Authentication } from "@/lib/auth";

export default function FormAuthPage() {
  const [state] = useEditorState();
  const [strategy, setStrategy] =
    useState<Authentication.ChallengeType>("passcode");
  const [config, setConfig] = useState({
    password: "",
    emailTemplate: "",
    otpMessage: "",
  });
  const [selectedIdentifierFields, setSelectedIdentifierFields] = useState<
    string[]
  >([]);
  const [extraKbaFields, setExtraKbaFields] = useState<ExtraKbaField[]>([
    { id: 1, type: "standard", field: "" },
  ]);

  const handleChange = (field: keyof typeof config, value: string) =>
    setConfig((prev) => ({ ...prev, [field]: value }));

  const toggleIdentifierField = (field: string) =>
    setSelectedIdentifierFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );

  const updateExtraKbaField = (
    id: number,
    key: keyof ExtraKbaField,
    value: string
  ) => {
    setExtraKbaFields((prev) =>
      prev.map((field) =>
        field.id === id ? { ...field, [key]: value } : field
      )
    );
  };

  const addExtraKbaField = () => {
    const newId = extraKbaFields.length
      ? Math.max(...extraKbaFields.map((f) => f.id)) + 1
      : 1;
    setExtraKbaFields((prev) => [
      ...prev,
      { id: newId, type: "standard", field: "" },
    ]);
  };

  const removeExtraKbaField = (id: number) => {
    setExtraKbaFields((prev) => prev.filter((field) => field.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (strategy === "kba") {
      if (!selectedIdentifierFields.length) {
        alert("Select at least one identifier field.");
        return;
      }
      if (
        !extraKbaFields.length ||
        extraKbaFields.some((f) => f.field.trim() === "")
      ) {
        alert("Add at least one extra field and fill in all fields.");
        return;
      }
    }
    console.log(
      "Strategy:",
      strategy,
      "Config:",
      config,
      "Identifiers:",
      selectedIdentifierFields,
      "Extra KBA Fields:",
      extraKbaFields
    );
  };

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-semibold">Configure Form Authentication</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Select Authentication Strategy</CardTitle>
            <CardDescription>
              Set up the authentication strategy.{" "}
              <Link
                href={editorlink("connect/customer", {
                  basepath: state.basepath,
                  document_id: state.document_id,
                })}
                target="_blank"
                className="underline"
              >
                <OpenInNewWindowIcon className="me-1 inline align-middle" />
                Learn more
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={strategy}
              onValueChange={(value) =>
                setStrategy(value as Authentication.ChallengeType)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="password">
                  Password (Document Protection)
                </SelectItem>
                <SelectItem value="magic-link">
                  Magic Link (Email Link)
                </SelectItem>
                <SelectItem value="otp">Email OTP</SelectItem>
                <SelectItem value="kba">
                  KBA (Knowledge-Based Authentication)
                </SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {strategy === "passcode" && (
          <Card>
            <CardHeader>
              <CardTitle>Password Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                type="password"
                placeholder="Enter document password"
                value={config.password}
                onChange={(e) => handleChange("password", e.target.value)}
              />
            </CardContent>
          </Card>
        )}

        {(strategy === "magic-link" || strategy === "otp") && (
          <Card>
            <CardHeader>
              <CardTitle>Email Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                type="text"
                placeholder="Enter email template or OTP message"
                value={
                  strategy === "magic-link"
                    ? config.emailTemplate
                    : config.otpMessage
                }
                onChange={(e) =>
                  handleChange(
                    strategy === "magic-link" ? "emailTemplate" : "otpMessage",
                    e.target.value
                  )
                }
              />
            </CardContent>
          </Card>
        )}

        {strategy === "kba" && (
          <KbaConfiguration
            selectedIdentifierFields={selectedIdentifierFields}
            toggleIdentifierField={toggleIdentifierField}
            extraKbaFields={extraKbaFields}
            updateExtraKbaField={updateExtraKbaField}
            addExtraKbaField={addExtraKbaField}
            removeExtraKbaField={removeExtraKbaField}
          />
        )}

        <Button type="submit">Save Configuration</Button>
      </form>
    </main>
  );
}

export type ExtraKbaField = {
  id: number;
  type: "standard" | "custom";
  field: string;
};

type KbaConfigurationProps = {
  selectedIdentifierFields: string[];
  toggleIdentifierField: (field: string) => void;
  extraKbaFields: ExtraKbaField[];
  updateExtraKbaField: (
    id: number,
    key: keyof ExtraKbaField,
    value: string
  ) => void;
  addExtraKbaField: () => void;
  removeExtraKbaField: (id: number) => void;
};

const identifierFields = [
  { label: "Email", value: "email" },
  { label: "Phone", value: "phone" },
  { label: "Name", value: "name" },
];

const standardExtraFields = [
  { label: "Email", value: "email" },
  { label: "Phone", value: "phone" },
  { label: "Name", value: "name" },
  { label: "Description", value: "description" },
  { label: "Created At", value: "created_at" },
];

function KbaConfiguration({
  selectedIdentifierFields,
  toggleIdentifierField,
  extraKbaFields,
  updateExtraKbaField,
  addExtraKbaField,
  removeExtraKbaField,
}: KbaConfigurationProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>KBA Configuration</CardTitle>
        <CardDescription>
          Select at least one identifier (Email, Phone, Name) and add extra
          fields.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h2 className="font-medium">Identifier Fields</h2>
          <div className="space-y-2">
            {identifierFields.map((field) => (
              <div key={field.value} className="flex items-center space-x-2">
                <Checkbox
                  checked={selectedIdentifierFields.includes(field.value)}
                  onCheckedChange={() => toggleIdentifierField(field.value)}
                />
                <Label>{field.label}</Label>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="font-medium">Extra Fields</h2>
          {extraKbaFields.map((field) => (
            <div key={field.id} className="flex items-center space-x-2">
              <Select
                value={field.type}
                onValueChange={(val) =>
                  updateExtraKbaField(field.id, "type", val)
                }
              >
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              {field.type === "standard" ? (
                <Select
                  value={field.field}
                  onValueChange={(val) =>
                    updateExtraKbaField(field.id, "field", val)
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    {standardExtraFields.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="text"
                  placeholder="Enter custom field"
                  value={field.field}
                  onChange={(e) =>
                    updateExtraKbaField(field.id, "field", e.target.value)
                  }
                />
              )}
              <Button
                variant="destructive"
                onClick={() => removeExtraKbaField(field.id)}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={addExtraKbaField}>
            Add Extra Field
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
