"use client";

import { useState } from "react";
import Image from "next/image";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Template {
  id: number;
  name: string;
  image: string;
  price: number;
}

const templates: Template[] = [
  {
    id: 1,
    name: "Modern",
    image: "/www/.print/categories/07.png",
    price: 29.99,
  },
  {
    id: 2,
    name: "Classic",
    image: "/www/.print/categories/08.png",
    price: 39.99,
  },
  {
    id: 3,
    name: "Elegant",
    image: "/www/.print/categories/09.png",
    price: 49.99,
  },
  {
    id: 4,
    name: "Vintage",
    image: "/www/.print/categories/10.png",
    price: 59.99,
  },
];

const options: Template[] = [
  {
    id: 1,
    name: "A",
    image: "/www/.print/materials/01.png",
    price: 29.99,
  },
  {
    id: 2,
    name: "B",
    image: "/www/.print/materials/02.png",
    price: 39.99,
  },
  {
    id: 3,
    name: "C",
    image: "/www/.print/materials/03.png",
    price: 49.99,
  },
  {
    id: 4,
    name: "D",
    image: "/www/.print/materials/04.png",
    price: 59.99,
  },
];

function OptionCard({
  selected,
  onSelect,
  src,
  name,
  description,
}: {
  selected?: boolean;
  onSelect?: () => void;
  src: string;
  name: string;
  description: string;
}) {
  return (
    <Card
      className={`cursor-pointer transition-all ${selected ? "ring-2 ring-primary" : ""}`}
      onClick={onSelect}
    >
      <CardContent className="p-0 pb-2">
        <div className="relative aspect-square">
          <Image
            src={src || "/placeholder.svg"}
            alt={name}
            fill
            className="object-cover rounded-t-xl"
          />
          {selected && (
            <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
              <Check className="w-4 h-4" />
            </div>
          )}
        </div>
        <div className="px-2">
          <span className="font-semibold mt-2">{name}</span>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OrderPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null
  );
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
          <form onSubmit={handleSubmit} className="space-y-6">
            {/*  */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Product</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                {["01", "02", "03"].map((id) => (
                  <OptionCard
                    key={id}
                    src={`/www/.print/categories/${id}.png`}
                    name={id}
                    description={id}
                  />
                ))}
              </div>
            </section>
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Design</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                {templates.map((template) => (
                  <OptionCard
                    onSelect={() => setSelectedTemplate(template)}
                    key={template.id}
                    selected={selectedTemplate?.id === template.id}
                    src={template.image}
                    name={template.name}
                    description={"$" + template.price}
                  />
                ))}
              </div>
              <hr className="my-4" />
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                {options.map((option) => (
                  <OptionCard
                    // selected={selectedTemplate?.id === option.id}
                    // onSelect={() => setSelectedTemplate(option)}
                    key={option.id}
                    src={option.image}
                    name={option.name}
                    description={"$" + option.price}
                  />
                ))}
              </div>
            </section>
            {/*  */}

            <section>
              <h2 className="text-xl font-semibold mb-4">
                Enter Order Details
              </h2>
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    value={orderDetails.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={orderDetails.email}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    name="quantity"
                    type="number"
                    min="100"
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
              <h2 className="text-xl font-semibold mb-4">Shipping</h2>
              <div className="grid gap-4">
                Accurate
                <br />
                Fast
                <br />
                Faster
                <br />
                Fastest
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
          <div>
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
                <CardTitle>
                  <h3 className="font-semibold mb-2">Order Summary</h3>
                </CardTitle>
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
                        selectedTemplate.price * Number(orderDetails.quantity)
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
