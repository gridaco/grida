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
    name: "Business Card",
    image: "/www/.print/materials/01.png",
    price: 29.99,
  },
  {
    id: 2,
    name: "Flyer",
    image: "/www/.print/materials/02.png",
    price: 39.99,
  },
  {
    id: 3,
    name: "Brochure",
    image: "/www/.print/materials/03.png",
    price: 49.99,
  },
  {
    id: 4,
    name: "Poster",
    image: "/www/.print/materials/04.png",
    price: 59.99,
  },
];

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
    <div className="container mx-auto px-4 py-8">
      <header>
        <h1 className="text-3xl font-bold mb-8">Place Your Order</h1>
      </header>
      <div className="flex justify-between gap-20 mt-20">
        <aside className="flex-[4] max-w-4xl">
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">1. Select a Template</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
              {templates.map((template) => (
                <Card
                  key={template.id}
                  className={`cursor-pointer transition-all ${selectedTemplate?.id === template.id ? "ring-2 ring-primary" : ""}`}
                  onClick={() => setSelectedTemplate(template)}
                >
                  <CardContent className="p-0 pb-2">
                    <div className="relative aspect-square">
                      <Image
                        src={template.image || "/placeholder.svg"}
                        alt={template.name}
                        fill
                        className="object-cover rounded-t-xl"
                      />
                      {selectedTemplate?.id === template.id && (
                        <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    <div className="px-2">
                      <h3 className="font-semibold mt-2">{template.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        ${template.price}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">
                2. Enter Order Details
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
                    min="1"
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
            </div>

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
            <Card>
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
