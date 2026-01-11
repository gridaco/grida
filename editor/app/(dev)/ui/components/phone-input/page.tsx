"use client";

import React, { useState } from "react";
import { PhoneInput } from "@/components/extension/phone-input";
import { ComponentDemo } from "../component-demo";

export default function PhoneInputPage() {
  const [phone1, setPhone1] = useState("");
  const [phone2, setPhone2] = useState("+1");
  const [phone3, setPhone3] = useState("+82 10-1234-5678");

  return (
    <main className="container max-w-screen-lg mx-auto py-10">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Phone Input</h1>
          <p className="text-gray-600">
            An international phone number input with country code selection.
          </p>
        </div>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Default Phone Input</h2>
            <p className="text-sm text-gray-600">
              Basic phone input with country selector
            </p>
          </div>
          <ComponentDemo notes={`Current value: ${phone1 || "(empty)"}`}>
            <div className="space-y-2 w-full max-w-md">
              <label className="text-sm font-medium">Phone Number</label>
              <PhoneInput value={phone1} onChange={setPhone1} />
            </div>
          </ComponentDemo>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">
              With Initial Country Code
            </h2>
            <p className="text-sm text-gray-600">
              Phone input with pre-selected country
            </p>
          </div>
          <ComponentDemo notes={`Current value: ${phone2 || "(empty)"}`}>
            <div className="space-y-2 w-full max-w-md">
              <label className="text-sm font-medium">Phone Number (US)</label>
              <PhoneInput value={phone2} onChange={setPhone2} />
            </div>
          </ComponentDemo>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">With Default Value</h2>
            <p className="text-sm text-gray-600">
              Phone input with a pre-filled number
            </p>
          </div>
          <ComponentDemo notes={`Current value: ${phone3 || "(empty)"}`}>
            <div className="space-y-2 w-full max-w-md">
              <label className="text-sm font-medium">
                Phone Number (Korea)
              </label>
              <PhoneInput value={phone3} onChange={setPhone3} />
            </div>
          </ComponentDemo>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Form Example</h2>
            <p className="text-sm text-gray-600">
              Using phone input in a form context
            </p>
          </div>
          <ComponentDemo>
            <form className="space-y-4 max-w-md">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="Enter your name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <input
                  type="email"
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="Enter your email"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone Number</label>
                <PhoneInput />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                onClick={(e) => e.preventDefault()}
              >
                Submit
              </button>
            </form>
          </ComponentDemo>
        </section>
      </div>
    </main>
  );
}
