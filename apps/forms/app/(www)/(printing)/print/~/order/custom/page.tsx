"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, Upload, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import Link from "next/link";
import { sitemap } from "@/www/data/sitemap";

const steps = [
  "Project Details",
  "Design Preferences",
  "File Upload",
  "Review & Submit",
];

const featured_works = [
  {
    name: "Branding",
    description: "Create a unique brand identity for your business.",
    image: "/www/.print/materials/a.png",
  },
  {
    name: "Packaging",
    description: "Design custom packaging for your products.",
    image: "/www/.print/materials/b.png",
  },
  {
    name: "Marketing",
    description: "Promote your brand with custom marketing materials.",
    image: "/www/.print/materials/c.png",
  },
];

export default function CustomOrderPage() {
  const [currentStep, setCurrentStep] = useState(0);

  const nextStep = () =>
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-4xl font-bold mb-20 text-center">
        Custom Design & Production
      </h1>

      <div className="mb-12">
        <div className="flex justify-between">
          {steps.map((step, index) => (
            <div key={step} className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  index <= currentStep
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {index < currentStep ? (
                  <Check className="w-5 h-5" />
                ) : (
                  index + 1
                )}
              </div>
              <span className="text-sm mt-2 text-muted-foreground">{step}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 h-2 bg-muted rounded-full">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
            style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
          ></div>
        </div>
      </div>

      <motion.div
        key={currentStep}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
      >
        {currentStep === 0 && (
          <div className="space-y-6">
            <div>
              <Label htmlFor="projectName">Project Name</Label>
              <Input id="projectName" placeholder="Enter your project name" />
            </div>
            <div>
              <Label htmlFor="projectDescription">Project Description</Label>
              <Textarea
                id="projectDescription"
                placeholder="Describe your project in detail"
              />
            </div>
            <div>
              <Label>Project Type</Label>
              <RadioGroup defaultValue="branding">
                <div className="flex space-x-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="branding" id="branding" />
                    <Label htmlFor="branding">Branding</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="packaging" id="packaging" />
                    <Label htmlFor="packaging">Packaging</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="marketing" id="marketing" />
                    <Label htmlFor="marketing">Marketing</Label>
                  </div>
                </div>
              </RadioGroup>
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <Label htmlFor="stylePreference">Style Preference</Label>
              <Input
                id="stylePreference"
                placeholder="e.g., Modern, Vintage, Minimalist"
              />
            </div>
            <div>
              <Label htmlFor="colorScheme">Preferred Color Scheme</Label>
              <Input
                id="colorScheme"
                placeholder="e.g., Blue and white, Earth tones"
              />
            </div>
            <div>
              <Label htmlFor="inspiration">Inspiration or Examples</Label>
              <Textarea
                id="inspiration"
                placeholder="Share links or descriptions of designs you like"
              />
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-2 text-sm font-semibold">Upload your files</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Drag and drop or click to upload
              </p>
              <Button className="mt-4" variant="outline">
                Select Files
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Accepted file types: PDF, AI, PSD, JPG, PNG (Max 50MB each)
            </p>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Review Your Order</h2>
            <p>
              Please review your project details and make any necessary changes
              before submitting.
            </p>
            <div className="bg-muted p-4 rounded-lg">
              <p>
                <strong>Project Name:</strong> [Project Name]
              </p>
              <p>
                <strong>Project Type:</strong> [Project Type]
              </p>
              <p>
                <strong>Style Preference:</strong> [Style Preference]
              </p>
              <p>
                <strong>Files Uploaded:</strong> [Number of Files]
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              By submitting, you agree to our terms and conditions. We&apos;ll
              review your project and get back to you with a quote within 2
              business days.
            </p>
          </div>
        )}
      </motion.div>

      <div className="mt-8 flex justify-between">
        {currentStep > 0 && (
          <Button onClick={prevStep} variant="outline">
            Back
          </Button>
        )}
        <Button
          onClick={
            currentStep === steps.length - 1
              ? () => alert("Order submitted!")
              : nextStep
          }
          className="ml-auto"
        >
          {currentStep === steps.length - 1 ? "Submit Order" : "Next"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <hr className="my-16" />
      <div>
        <h2 className="text-lg font-semibold mb-6">Our Latest Work</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {featured_works.map((work, i) => (
            <Link key={i} href={sitemap.links.studio} target="_blank">
              <div className="rounded-lg overflow-hidden shadow-lg">
                <Image
                  src={work.image}
                  alt={work.description}
                  width={400}
                  height={300}
                  className="w-full h-48 object-cover"
                />
                <div className="p-4">
                  <h3 className="font-semibold">{work.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {work.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-4">
          <Link href={sitemap.links.studio} target="_blank">
            <Button variant="link" className="p-0">
              Visit our Studio
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
