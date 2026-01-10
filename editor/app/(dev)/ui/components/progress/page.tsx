"use client";

import React, { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { Progress as EditorProgress } from "@/components/ui-editor/progress";
import { Button } from "@/components/ui/button";
import { ComponentDemo } from "../component-demo";

export default function ProgressPage() {
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (isRunning && progress < 100) {
      const timer = setTimeout(() => {
        setProgress((prev) => Math.min(prev + 1, 100));
      }, 50);
      return () => clearTimeout(timer);
    } else if (progress >= 100) {
      setIsRunning(false);
    }
  }, [progress, isRunning]);

  const handleStart = () => {
    setProgress(0);
    setIsRunning(true);
  };

  const handleReset = () => {
    setProgress(0);
    setIsRunning(false);
  };

  return (
    <main className="container max-w-screen-lg mx-auto py-10">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Progress</h1>
          <p className="text-gray-600">
            Progress bars for displaying task completion and loading states.
          </p>
        </div>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Standard Progress</h2>
            <p className="text-sm text-gray-600">
              Determinate progress bar showing specific completion percentage
            </p>
          </div>
          <ComponentDemo>
            <div className="space-y-6 w-full max-w-md">
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Progress</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleStart} disabled={isRunning}>
                  {isRunning ? "Running..." : "Start"}
                </Button>
                <Button onClick={handleReset} variant="outline">
                  Reset
                </Button>
              </div>
            </div>
          </ComponentDemo>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Progress Variants</h2>
            <p className="text-sm text-gray-600">
              Different progress values and states
            </p>
          </div>
          <ComponentDemo>
            <div className="space-y-6 w-full max-w-md">
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>0% Complete</span>
                  <span>0%</span>
                </div>
                <Progress value={0} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>25% Complete</span>
                  <span>25%</span>
                </div>
                <Progress value={25} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>50% Complete</span>
                  <span>50%</span>
                </div>
                <Progress value={50} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>75% Complete</span>
                  <span>75%</span>
                </div>
                <Progress value={75} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>100% Complete</span>
                  <span>100%</span>
                </div>
                <Progress value={100} />
              </div>
            </div>
          </ComponentDemo>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">
              Editor Progress (Indeterminate)
            </h2>
            <p className="text-sm text-gray-600">
              Indeterminate progress bar for unknown duration tasks
            </p>
          </div>
          <ComponentDemo notes="Use this variant when the progress duration is unknown">
            <div className="w-full max-w-md">
              <EditorProgress indeterminate />
            </div>
          </ComponentDemo>
        </section>
      </div>
    </main>
  );
}
