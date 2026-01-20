"use client";

import { useState } from "react";
import { MapPin, Phone, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Here you would typically send the form data to your backend
    console.log("Form submitted:", formData);
    alert("Message sent successfully!");
    // Reset form after submission
    setFormData({ name: "", email: "", message: "" });
  };

  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8 text-center">Contact Us</h1>

      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <form onSubmit={handleSubmit} className="space-y-6">
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="message">Message</FieldLabel>
              <Textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleInputChange}
                required
                className="min-h-[150px]"
              />
            </Field>
            <Button type="submit" className="w-full">
              Send Message
            </Button>
          </form>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent>
              <h2 className="text-xl font-semibold mb-4">Our Information</h2>
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <MapPin className="text-primary" />
                  <span>123 Print Street, Design City, 12345</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Phone className="text-primary" />
                  <span>(123) 456-7890</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Mail className="text-primary" />
                  <span>contact@yourprintingplatform.com</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              {/* Replace this with an actual map integration */}
              <div className="bg-muted h-[300px] flex items-center justify-center">
                <MapPin className="size-12 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
