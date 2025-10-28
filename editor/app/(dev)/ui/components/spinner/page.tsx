"use client";

import React from "react";
import { Spinner } from "@/components/ui/spinner";

export default function SpinnerPage() {
  return (
    <main className="container max-w-screen-lg mx-auto py-10">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Spinner</h1>
          <p className="text-gray-600">
            A loading indicator component for displaying loading states.
          </p>
        </div>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Default Spinner</h2>
            <p className="text-sm text-gray-600">
              The standard spinner component
            </p>
          </div>
          <div className="flex items-center justify-center p-12 bg-gray-50 rounded-lg">
            <Spinner />
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Usage Examples</h2>
            <p className="text-sm text-gray-600">
              Common use cases for the spinner component
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-gray-50 rounded-lg flex flex-col items-center gap-3">
              <Spinner />
              <span className="text-sm text-gray-600">Loading content...</span>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg flex flex-col items-center gap-3">
              <Spinner />
              <span className="text-sm text-gray-600">Processing...</span>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg flex flex-col items-center gap-3">
              <Spinner />
              <span className="text-sm text-gray-600">Please wait...</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
