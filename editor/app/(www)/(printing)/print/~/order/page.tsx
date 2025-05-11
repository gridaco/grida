"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/lib/utils";
import Link from "next/link";
import { sitemap } from "@/www/data/sitemap";
import { ArrowRightIcon } from "@radix-ui/react-icons";
import { wwwprint } from "../../data";

const types = [
  {
    name: "Printing",
    image: "/www/.print/categories/01.png",
  },
  {
    name: "Cigar Band",
    image: "/www/.print/categories/22.png",
  },
  {
    name: "Packaging",
    image: "/www/.print/categories/02.png",
  },
];

const shipping_options = [
  {
    name: "Accurate",
    description: "7~14 days",
    price: "Save $50",
  },
  { name: "Fast", description: "5~7 days", price: "Free" },
  {
    name: "Faster",
    description: "3~5 days",
    price: "+ $50",
  },
  { name: "Fastest", description: "2~3 days", price: "+ $100" },
];

const pp = [
  {
    name: "Coating Glossy",
    image: "/www/.print/pp/pp-coating-glossy-icon.png",
  },
  {
    name: "Coating Matte",
    image: "/www/.print/pp/pp-coating-matte-icon.png",
  },
  {
    name: "Foil Stamping",
    image: "/www/.print/pp/pp-foil-stamping-icon.png",
  },
  {
    name: "Hole Punching",
    image: "/www/.print/pp/pp-hole-punching-icon.png",
  },
  {
    name: "Shape Cutting",
    image: "/www/.print/pp/pp-shape-cutting-icon.png",
  },
  {
    name: "Trimming",
    image: "/www/.print/pp/pp-trimming-icon.png",
  },
  {
    name: "UV Scodix",
    image: "/www/.print/pp/pp-uv-scodix-icon.png",
  },
];

function OptionCard({
  selected,
  onSelect,
  children,
  className,
}: React.PropsWithChildren<{
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
}>) {
  return (
    <Card
      className={cn(
        `relative cursor-pointer transition-all ${selected ? "ring-2 ring-primary" : ""}`,
        className
      )}
      onClick={onSelect}
    >
      {selected && (
        <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1 z-10">
          <Check className="size-4" />
        </div>
      )}
      {children}
    </Card>
  );
}

export default function OrderPage() {
  const [type, setType] = useState<string>(types[0].name);
  const [selectedTemplate, setSelectedTemplate] =
    useState<wwwprint.Template | null>(null);
  const [orderDetails, setOrderDetails] = useState({
    name: "",
    email: "",
    quantity: "",
    customization: "",
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setOrderDetails((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Here you would typically send the order to your backend
    console.log("Order submitted:", {
      template: selectedTemplate,
      ...orderDetails,
    });
    alert("Order submitted successfully!");
  };

  return (
    <div className="container mx-auto px-4 py-16">
      <header>
        <h1 className="text-3xl font-bold mb-8">Place Your Order</h1>
      </header>
      <div className="flex justify-between gap-20 mt-20">
        <aside className="flex-[4] max-w-4xl">
          <form onSubmit={handleSubmit} className="space-y-40">
            {/*  */}
            <section>
              <h2 className="text-xl font-semibold mb-4">Choose Type</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
                {types.map(({ name, image }) => (
                  <OptionCard
                    selected={type === name}
                    onSelect={() => setType(name)}
                    key={name}
                    className="overflow-hidden"
                  >
                    <CardContent className="p-0">
                      <div className="relative aspect-video">
                        <Image
                          src={image}
                          alt={name}
                          fill
                          className="object-cover rounded-t-xl"
                        />
                      </div>
                    </CardContent>
                  </OptionCard>
                ))}
              </div>
            </section>
            {/*  */}
            <section className="space-y-8">
              <header className="flex justify-between items-center">
                <h2 className="text-xl font-semibold mb-4">Select Design</h2>
                <Link href={sitemap.print.links.templates}>
                  <Button variant="link">
                    Browse all templates
                    <ArrowRightIcon className="inline ms-2" />
                  </Button>
                </Link>
              </header>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                {wwwprint.templates
                  .filter((d) => d.category === type)
                  .map((template) => (
                    <OptionCard
                      onSelect={() => setSelectedTemplate(template)}
                      key={template.id}
                      selected={selectedTemplate?.id === template.id}
                    >
                      <CardContent className="p-0 pb-2">
                        <div className="relative aspect-square">
                          <Image
                            src={template.image}
                            alt={template.name}
                            fill
                            className="object-cover rounded-t-xl"
                          />
                        </div>
                        <div className="px-2">
                          <span className="font-semibold mt-2">
                            {template.name}
                          </span>
                          <p className="text-sm text-muted-foreground">
                            ${template.price} / {template.step} units
                          </p>
                        </div>
                      </CardContent>
                    </OptionCard>
                  ))}
              </div>
              <hr className="my-4" />
              <h2 className="font-semibold mb-4">Properties</h2>
              <div className="grid gap-2">
                <label className="text-xs font-bold uppercase">Material</label>
                <div className="grid grid-cols-1 sm:grid-cols-4 md:grid-cols-8 gap-2">
                  {wwwprint.materials.map((mat) => (
                    <OptionCard
                      selected={
                        selectedTemplate?.properties.material === mat.id
                      }
                      // onSelect={() => setSelectedTemplate(option)}
                      key={mat.id}
                      className="overflow-hidden"
                    >
                      <CardContent className="p-0">
                        <div className="relative aspect-square">
                          <Image
                            src={mat.image}
                            alt={mat.name}
                            fill
                            className="object-cover rounded-t-xl"
                          />
                        </div>
                      </CardContent>
                    </OptionCard>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-bold uppercase">Size</label>
                <Input
                  readOnly
                  value={`${selectedTemplate?.properties.size.width}x${selectedTemplate?.properties.size.height}mm`}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-bold uppercase">
                  Post Press
                </label>
                <div className="flex flex-wrap gap-2">
                  {pp.map((prop) => (
                    <OptionCard
                      key={prop.name}
                      className="w-14 h-14 overflow-hidden rounded-sm"
                    >
                      <Image
                        src={prop.image}
                        alt={prop.name}
                        fill
                        className="object-cover dark:invert"
                      />
                    </OptionCard>
                  ))}
                </div>
              </div>
            </section>
            {/*  */}
            <section>
              <h2 className="text-xl font-semibold mb-4">
                Enter Order Details
              </h2>
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    name="quantity"
                    type="number"
                    autoComplete="off"
                    min={selectedTemplate?.step}
                    step={selectedTemplate?.step}
                    value={orderDetails.quantity}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="customization">Customization Details</Label>
                  <Textarea
                    id="customization"
                    name="customization"
                    value={orderDetails.customization}
                    onChange={handleInputChange}
                    placeholder="Enter any specific customization requests"
                  />
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">Shipping Options</h2>
              <div className="grid gap-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {shipping_options.map((op) => (
                    <OptionCard key={op.name}>
                      <CardContent className="p-0 pb-2">
                        <div className="flex flex-col px-3 gap-4">
                          <div className="flex flex-col">
                            <span className=" font-medium mt-2">{op.name}</span>
                            <span className="text-sm text-muted-foreground">
                              {op.description}
                            </span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {op.price}
                          </span>
                        </div>
                      </CardContent>
                    </OptionCard>
                  ))}
                </div>
              </div>
            </section>

            <Button
              type="submit"
              className="w-full"
              disabled={
                !selectedTemplate ||
                !orderDetails.name ||
                !orderDetails.email ||
                !orderDetails.quantity
              }
            >
              Place Order
            </Button>
          </form>
        </aside>
        <aside className="flex-[2] max-w-sm">
          <div className="sticky top-20">
            <Card className="overflow-hidden">
              {selectedTemplate && (
                <div>
                  <Image
                    src={selectedTemplate?.image || "/placeholder.svg"}
                    alt={selectedTemplate?.name || ""}
                    width={400}
                    height={400}
                  />
                </div>
              )}
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p>
                  <strong>Template:</strong>{" "}
                  {selectedTemplate ? selectedTemplate.name : "Not selected"}
                </p>
                <p>
                  <strong>Price:</strong> $
                  {selectedTemplate ? selectedTemplate.price : "0.00"}
                </p>
                <p>
                  <strong>Quantity:</strong> {orderDetails.quantity || "0"}
                </p>
                <p>
                  <strong>Total:</strong> $
                  {selectedTemplate && orderDetails.quantity
                    ? (
                        (selectedTemplate.price / selectedTemplate.step) *
                        Number(orderDetails.quantity)
                      ).toFixed(2)
                    : "0.00"}
                </p>
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>
    </div>
  );
}
