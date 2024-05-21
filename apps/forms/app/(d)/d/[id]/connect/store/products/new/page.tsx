"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ArrowDownIcon,
  PlusCircledIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { useState } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

function Header() {
  // TODO: links
  return (
    <header>
      <h1 className="prose font-bold">Add product</h1>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="~/store">Store</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="~/store/products">Products</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}

export default function StoreProductsNewPage() {
  return (
    <main className="container max-w-3xl mx-auto flex flex-col gap-10">
      <Header />
      <Info />
      <Variants />
      <footer>
        <div className="flex justify-end gap-4">
          <Button>Save</Button>
        </div>
      </footer>
    </main>
  );
}

function Info() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Product Details</CardTitle>
        <CardDescription>This is shown to your customers</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6">
          <div className="grid gap-3">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              className="w-full"
              placeholder="Product Name"
            />
          </div>
          {/* <div className="grid gap-3">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              className="min-h-32"
              placeholder="Product Description"
            />
          </div> */}
        </div>
      </CardContent>
    </Card>
  );
}

function makeVariants(options: { name: string; values: string[] }[]) {
  const variants: Record<string, string>[] = [];

  function generateVariants(
    accumulator: Record<string, string>,
    index: number
  ) {
    if (index === options.length) {
      variants.push(accumulator);
      return;
    }

    const { name, values } = options[index];

    for (const value of values) {
      const newAccumulator = { ...accumulator, [name]: value };
      generateVariants(newAccumulator, index + 1);
    }
  }

  generateVariants({}, 0);
  return variants;
}

interface OptionGroup {
  name: string;
  values: string[];
}

function Variants() {
  const [groups, setGroups] = useState<OptionGroup[]>([]);

  const variants = makeVariants(groups);

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>Variants</CardTitle>
          <CardDescription>Add options like size or color</CardDescription>
        </CardHeader>
        <CardContent>
          {
            <div className="grid gap-6">
              {groups.map((option, i) => (
                <OptionCard key={i} />
              ))}
            </div>
          }
        </CardContent>
        <CardFooter className="justify-center border-t p-4">
          <Button
            size="sm"
            variant="ghost"
            className="gap-1"
            onClick={() => {
              const newVariants = [...groups];
              newVariants.push({ name: "", values: [] });
              setGroups(newVariants);
            }}
          >
            <PlusCircledIcon className="h-3.5 w-3.5" />
            Add Variant
          </Button>
        </CardFooter>
      </Card>
      <div className="w-full flex justify-center my-5">
        <ArrowDownIcon className="w-5 h-5" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Generated Variants</CardTitle>
          <CardDescription>
            <code>{variants.length}</code> variants will be created
          </CardDescription>
        </CardHeader>
        <CardContent>
          {variants.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {groups.map((option, i) => (
                    <TableHead key={i}>{option.name}</TableHead>
                  ))}
                  <TableHead>Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((variant, i) => (
                  <TableRow key={i}>
                    {groups.map((option, j) => (
                      <TableCell key={j}>{variant[option.name]}</TableCell>
                    ))}
                    <TableCell>0</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">No variants</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type DraftableOptionValue = string | { __draft: true };

function OptionCard({}: {}) {
  const [name, setName] = useState<string>("");
  const [values, setValues] = useState<DraftableOptionValue[]>([
    { __draft: true },
  ]);

  const can_delete_value = values.length > 1;
  const has_draft_value = values.some(
    (value) => typeof value === "object" && "__draft" in value
  );

  return (
    <Card className="shadow-none">
      <CardContent className="pt-4 flex flex-col gap-6">
        <Label className="grid gap-3">
          Option Name
          <Input
            type="text"
            className="w-full"
            value={name}
            placeholder="Size, Color, etc."
            onChange={(e) => setName(e.target.value)}
          />
        </Label>
        <Label className="grid gap-3">
          Option Values
          <fieldset className="w-full flex flex-col gap-2">
            {values.map((value, i) => (
              <div key={i} className="flex gap-2">
                <div className="relative">
                  <Input
                    type="text"
                    className="w-full"
                    placeholder="Small"
                    value={typeof value === "string" ? value : ""}
                    onChange={(e) => {
                      const newValues = [...values];
                      newValues[i] = e.target.value;
                      setValues(newValues);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (has_draft_value) return;
                        // create new draft value
                        const newValues = [...values];
                        newValues.push({ __draft: true });
                        setValues(newValues);
                      }
                    }}
                  />
                  {can_delete_value && (
                    <div
                      className="absolute top-0 right-2 bottom-0 flex items-center justify-center"
                      onClick={() => {
                        const newValues = [...values];
                        newValues.splice(i, 1);
                        setValues(newValues);
                      }}
                    >
                      <button className="w-4 h-4 ">
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </fieldset>
        </Label>
      </CardContent>
    </Card>
  );
}
