"use client";

import { useState } from "react";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Upload } from "lucide-react";

import { getCountries } from "libphonenumber-js";

const countries = getCountries().sort();

export default function PhoneNumberTool() {
  const [inputText, setInputText] = useState("");
  const [country, setCountry] = useState("US");
  const [outputText, setOutputText] = useState("");
  const [error, setError] = useState("");

  // Process phone numbers
  const processPhoneNumbers = () => {
    setError("");

    if (!inputText.trim()) {
      setError("Please enter at least one phone number");
      return;
    }

    const phoneNumbers = inputText.split("\n").filter((line) => line.trim());
    const formattedNumbers = [];
    const errors = [];

    for (let i = 0; i < phoneNumbers.length; i++) {
      const phoneNumber = phoneNumbers[i].trim();

      try {
        const parsedNumber = parsePhoneNumberFromString(
          phoneNumber,
          country as any
        );

        if (parsedNumber && parsedNumber.isValid()) {
          formattedNumbers.push(parsedNumber.format("E.164"));
        } else {
          formattedNumbers.push(`[Invalid: ${phoneNumber}]`);
          errors.push(`Line ${i + 1}: Invalid phone number "${phoneNumber}"`);
        }
      } catch (e) {
        formattedNumbers.push(`[Error: ${phoneNumber}]`);
        errors.push(`Line ${i + 1}: Error processing "${phoneNumber}"`);
      }
    }

    setOutputText(formattedNumbers.join("\n"));

    if (errors.length > 0) {
      setError(
        `Some numbers could not be formatted: ${errors.length} error(s)`
      );
    }
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setInputText(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  // Download results
  const downloadResults = () => {
    if (!outputText) return;

    const blob = new Blob([outputText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "e164-phone-numbers.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold text-center mb-2">
        E.164 Phone Number Tool
      </h1>
      <p className="text-center text-muted-foreground mb-8">
        Format phone numbers to the international E.164 standard
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle>Input</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="country">Select Country Code</FieldLabel>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger id="country">
                  <SelectValue placeholder="Select a country" />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="phoneNumbers">
                Enter phone numbers (one per line)
                </FieldLabel>
              <Textarea
                id="phoneNumbers"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Enter phone numbers here..."
                className="min-h-[200px]"
              />
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button onClick={processPhoneNumbers} className="flex-1">
              Format Numbers
            </Button>

            <div className="relative flex-1">
              <Button variant="outline" className="w-full">
                <Upload className="size-4" />
                Upload File
              </Button>
              <input
                type="file"
                accept=".txt"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
          </CardFooter>
        </Card>

        {/* Output Section */}
        <Card>
          <CardHeader>
            <CardTitle>Output</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="space-y-4">
              {error && <p className="text-sm text-red-500">{error}</p>}

              <Textarea
                value={outputText}
                readOnly
                placeholder="Formatted E.164 numbers will appear here..."
                className="min-h-[200px]"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              onClick={downloadResults}
              disabled={!outputText}
              className="w-full"
            >
              <Download className="size-4" />
              Download Results
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
