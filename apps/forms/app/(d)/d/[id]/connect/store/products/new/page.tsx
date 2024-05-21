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
import { useState, useRef, useEffect } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { AdjustStockCountButton } from "@/scaffolds/options/adjust-stock-button";

function Header() {
  // TODO: links
  return (
    <header>
      <h1 className="prose font-bold">Add product</h1>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="../">Store</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="./">Products</BreadcrumbLink>
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
          <div className="grid gap-3">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              className="min-h-32"
              placeholder="Product Description"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function makeVariants(
  options: { name: string; values: string[] }[]
): Record<string, string>[] {
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

  const addNewVariantGroup = () => {
    const newVariants = [...groups];
    newVariants.push({ name: "", values: [] });
    setGroups(newVariants);
  };

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>Variants</CardTitle>
          <CardDescription>Add options like size or color</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            {groups.map((option, i) => (
              <OptionCard
                key={i}
                option={option}
                onUpdate={(updatedOption) => {
                  const newGroups = [...groups];
                  newGroups[i] = updatedOption;
                  setGroups(newGroups);
                }}
                onDelete={() => {
                  const newGroups = groups.filter((_, index) => index !== i);
                  setGroups(newGroups);
                }}
              />
            ))}
          </div>
        </CardContent>
        <CardFooter className="justify-center border-t p-4">
          <Button
            size="sm"
            variant="ghost"
            className="gap-1"
            onClick={addNewVariantGroup}
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
                    <TableCell>
                      <AdjustStockCountButton
                        stock={0}
                        onSave={(stock) => {
                          // TODO:
                          console.log(`Stock for variant ${i} is ${stock}`);
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No variants</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type DraftableOptionValue = string | { __draft: true };

interface OptionCardProps {
  option: OptionGroup;
  onUpdate: (updatedOption: OptionGroup) => void;
  onDelete: () => void;
}

function OptionCard({ option, onUpdate, onDelete }: OptionCardProps) {
  const [name, setName] = useState<string>(option.name);
  const [values, setValues] = useState<DraftableOptionValue[]>([
    ...option.values,
    { __draft: true },
  ]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [lastAddedDraft, setLastAddedDraft] = useState(false);

  const canDeleteValue = values.length > 1;
  const hasDraftValue = values.some(
    (value) => typeof value === "object" && "__draft" in value
  );

  useEffect(() => {
    if (lastAddedDraft && inputRefs.current.length > 0) {
      const lastIndex = inputRefs.current.length - 1;
      if (inputRefs.current[lastIndex]) {
        inputRefs.current[lastIndex]!.focus();
      }
      setLastAddedDraft(false);
    }
  }, [values, lastAddedDraft]);

  const handleNameChange = (newName: string) => {
    setName(newName);
    onUpdate({
      ...option,
      name: newName,
      values: values.filter(
        (value): value is string => typeof value === "string"
      ),
    });
  };

  const handleValueChange = (index: number, newValue: string) => {
    const newValues = [...values];
    newValues[index] = newValue;
    setValues(newValues);
    onUpdate({
      ...option,
      values: newValues.filter(
        (value): value is string => typeof value === "string"
      ),
    });
  };

  const handleValueDelete = (index: number) => {
    const newValues = values.filter((_, i) => i !== index);
    setValues(newValues);
    onUpdate({
      ...option,
      values: newValues.filter(
        (value): value is string => typeof value === "string"
      ),
    });
  };

  const handleKeyPress = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number
  ) => {
    if (e.key === "Enter" && !hasDraftValue) {
      const newValues = [...values, { __draft: true }];
      setValues(newValues as any);
      setLastAddedDraft(true);
    }
  };

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
            onChange={(e) => handleNameChange(e.target.value)}
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
                    onChange={(e) => handleValueChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyPress(e, i)}
                    ref={(el) => (inputRefs.current[i] = el)}
                  />
                  {canDeleteValue && (
                    <div
                      className="absolute top-0 right-2 bottom-0 flex items-center justify-center"
                      onClick={() => handleValueDelete(i)}
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
      <CardFooter>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          Delete Option
        </Button>
      </CardFooter>
    </Card>
  );
}
