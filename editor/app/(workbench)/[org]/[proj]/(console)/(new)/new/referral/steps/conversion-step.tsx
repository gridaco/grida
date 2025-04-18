"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DollarSign, ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ConversionStepProps {
  data: any;
  updateData: (data: any) => void;
}

const currencies = [
  "XTS",
  "USD",
  "EUR",
  "GBP",
  "KRW",
  "JPY",
  "Points",
  "Credits",
];

// Industry benchmark data
const industryBenchmarks = [
  {
    industry: "General SaaS",
    metric: "Average Revenue Per Account (ARPA)",
    value: "$100 per month",
  },
  {
    industry: "Digital Design Firms",
    metric: "Customer Lifetime Value (CLV)",
    value: "$90,000",
  },
  {
    industry: "Financial Advisory Firms",
    metric: "Customer Lifetime Value (CLV)",
    value: "$164,000",
  },
  {
    industry: "Commercial Insurance Companies",
    metric: "Customer Lifetime Value (CLV)",
    value: "$321,000",
  },
  {
    industry: "Healthcare Consulting Firms",
    metric: "Customer Lifetime Value (CLV)",
    value: "$330,000",
  },
];

export function ConversionStep({ data, updateData }: ConversionStepProps) {
  const [isExamplesOpen, setIsExamplesOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="bg-primary/10 p-3 rounded-full">
          <DollarSign className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-medium">Set Conversion Value</h3>
          <p className="text-muted-foreground">
            Define the value of each conversion for your campaign. This helps
            track ROI and measure success.
          </p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-md inline-flex items-center mb-2">
        You can change this later
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <p className="text-sm">
            Setting a conversion value helps you track the return on investment
            (ROI) of your referral campaign. This is the estimated value of each
            new user who joins through a referral.
          </p>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <HelpCircle className="h-4 w-4" />
                  <span className="sr-only">More information</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>
                  For subscription businesses, consider using monthly or annual
                  revenue. For one-time purchases, use the average order value
                  or customer lifetime value.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="grid md:grid-cols-2 gap-4 p-4 border rounded-md">
          <div>
            <Label htmlFor="conversion-currency">Conversion Currency</Label>
            <Select
              value={data.conversion_currency}
              onValueChange={(value) =>
                updateData({ conversion_currency: value })
              }
            >
              <SelectTrigger id="conversion-currency">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((currency) => (
                  <SelectItem key={currency} value={currency}>
                    {currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="conversion-value">Conversion Value</Label>
            <Input
              id="conversion-value"
              type="number"
              min="0"
              step="0.01"
              placeholder="100.00"
              value={data.conversion_value || ""}
              onChange={(e) =>
                updateData({
                  conversion_value: Number.parseFloat(e.target.value) || null,
                })
              }
            />
            <p className="text-xs text-muted-foreground mt-1">
              The estimated value of each successful referral conversion.
            </p>
          </div>
        </div>

        <Collapsible
          open={isExamplesOpen}
          onOpenChange={setIsExamplesOpen}
          className="border rounded-md overflow-hidden"
        >
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="flex w-full justify-between p-4 h-auto"
            >
              <span className="font-medium">Industry Benchmarks</span>
              {isExamplesOpen ? (
                <ChevronUp className="h-4 w-4 opacity-70" />
              ) : (
                <ChevronDown className="h-4 w-4 opacity-70" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 py-4">
              <p className="text-sm text-muted-foreground mb-3">
                Here are some industry examples to help you estimate your
                conversion value:
              </p>
              <div className="space-y-2">
                {industryBenchmarks.map((benchmark, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-12 text-sm py-1 border-b last:border-0"
                  >
                    <div className="col-span-5 font-medium">
                      {benchmark.industry}
                    </div>
                    <div className="col-span-4 text-muted-foreground">
                      {benchmark.metric}
                    </div>
                    <div className="col-span-3 text-right">
                      {benchmark.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="p-4 bg-muted/20 rounded-md">
          <h4 className="font-medium text-sm mb-2">Why this matters</h4>
          <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc pl-5">
            <li>Calculate the ROI of your referral program</li>
            <li>Compare performance across different campaigns</li>
            <li>Make data-driven decisions about reward structures</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
