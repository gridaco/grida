"use client";

import React from "react";
import {
  EmailChallenge,
  EmailChallengePreview,
} from "@/components/formfield/email-challenge";
import { ComponentDemo } from "../component-demo";

export default function EmailChallengePage() {
  return (
    <main className="container max-w-screen-lg mx-auto py-10">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Email Challenge</h1>
          <p className="text-gray-600">
            Email input field with embedded challenge UI for email verification
            (send code + verify OTP). Placeholder, non-functional for now.
          </p>
        </div>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Basic Usage</h2>
            <p className="text-sm text-gray-600">
              Email challenge component with send button and OTP input
            </p>
          </div>
          <ComponentDemo
            notes={
              <>
                <strong>Note:</strong> This is a placeholder component. The send
                button toggles local state only (no network call). OTP input is
                ephemeral and won't be submitted with the form.
              </>
            }
          >
            <EmailChallengePreview
              name="email"
              label="Email Address"
              placeholder="alice@example.com"
              required
            />
          </ComponentDemo>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Optional Field</h2>
            <p className="text-sm text-gray-600">
              Email challenge without required validation
            </p>
          </div>
          <ComponentDemo>
            <EmailChallengePreview
              name="optional_email"
              label="Optional Email"
              placeholder="Enter your email (optional)"
              required={false}
            />
          </ComponentDemo>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Disabled State</h2>
            <p className="text-sm text-gray-600">
              Email challenge in disabled state
            </p>
          </div>
          <ComponentDemo>
            <EmailChallengePreview
              name="disabled_email"
              label="Disabled Email"
              placeholder="alice@example.com"
              required
              disabled
            />
          </ComponentDemo>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Form Example</h2>
            <p className="text-sm text-gray-600">
              Using email challenge in a form context
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
              <EmailChallengePreview
                name="email"
                label="Email Address"
                placeholder="alice@example.com"
                required
              />
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
