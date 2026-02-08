"use client";

import React, { useState } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import DegreeControl from "@/scaffolds/sidecontrol/controls/degree";
import { ComponentDemo } from "../component-demo";

export default function DegreeControlPage() {
  const [rotation, setRotation] = useState(0);
  const [constrainedRotation, setConstrainedRotation] = useState(0);
  const [disabledRotation, setDisabledRotation] = useState(45);

  return (
    <TooltipPrimitive.Provider>
      <main className="container max-w-screen-lg mx-auto py-10">
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Degree Control</h1>
            <p className="text-gray-600">
              A rotary control for selecting angles with keyboard and mouse
              support.
            </p>
          </div>

          <hr />

          {/* Size Variants */}
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold mb-1">Size Variants</h2>
              <p className="text-sm text-gray-600">
                Available in five sizes: icon, sm, md, lg, and xl
              </p>
            </div>
            <ComponentDemo notes={`Current rotation: ${rotation}°`}>
              <div className="flex gap-8 items-center flex-wrap">
                <div className="flex flex-col gap-2 items-center">
                  <DegreeControl
                    value={rotation}
                    onChange={setRotation}
                    size="icon"
                  />
                  <span className="text-xs text-gray-500">icon (24px)</span>
                </div>
                <div className="flex flex-col gap-2 items-center">
                  <DegreeControl
                    value={rotation}
                    onChange={setRotation}
                    size="sm"
                  />
                  <span className="text-xs text-gray-500">sm (32px)</span>
                </div>
                <div className="flex flex-col gap-2 items-center">
                  <DegreeControl
                    value={rotation}
                    onChange={setRotation}
                    size="md"
                  />
                  <span className="text-xs text-gray-500">md (48px)</span>
                </div>
                <div className="flex flex-col gap-2 items-center">
                  <DegreeControl
                    value={rotation}
                    onChange={setRotation}
                    size="lg"
                  />
                  <span className="text-xs text-gray-500">lg (64px)</span>
                </div>
                <div className="flex flex-col gap-2 items-center">
                  <DegreeControl
                    value={rotation}
                    onChange={setRotation}
                    size="xl"
                  />
                  <span className="text-xs text-gray-500">xl (80px)</span>
                </div>
              </div>
            </ComponentDemo>
          </section>

          <hr />

          {/* Constrained Mode */}
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold mb-1">Constrained Mode</h2>
              <p className="text-sm text-gray-600">
                Limit the rotation range with min and max values
              </p>
            </div>
            <ComponentDemo
              notes={`Constrained rotation: ${constrainedRotation}°`}
            >
              <div className="flex gap-8 items-center flex-wrap">
                <div className="flex flex-col gap-2 items-center">
                  <DegreeControl
                    value={constrainedRotation}
                    onChange={setConstrainedRotation}
                    size="lg"
                    loop={false}
                    min={0}
                    max={180}
                  />
                  <span className="text-xs text-gray-500">0-180° range</span>
                </div>
                <div className="flex flex-col gap-2 items-center">
                  <DegreeControl
                    value={constrainedRotation}
                    onChange={setConstrainedRotation}
                    size="lg"
                    loop={false}
                    min={-45}
                    max={45}
                  />
                  <span className="text-xs text-gray-500">-45° to 45°</span>
                </div>
                <div className="flex flex-col gap-2 items-center">
                  <DegreeControl
                    value={constrainedRotation}
                    onChange={setConstrainedRotation}
                    size="lg"
                    loop={false}
                    min={90}
                    max={270}
                  />
                  <span className="text-xs text-gray-500">90° to 270°</span>
                </div>
              </div>
            </ComponentDemo>
          </section>

          <hr />

          {/* Disabled State */}
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold mb-1">Disabled State</h2>
              <p className="text-sm text-gray-600">
                Non-interactive state for read-only display
              </p>
            </div>
            <ComponentDemo>
              <div className="flex gap-8 items-center flex-wrap">
                <div className="flex flex-col gap-2 items-center">
                  <DegreeControl value={disabledRotation} size="md" disabled />
                  <span className="text-xs text-gray-500">Disabled</span>
                </div>
                <div className="flex flex-col gap-2 items-center">
                  <DegreeControl value={disabledRotation} size="lg" disabled />
                  <span className="text-xs text-gray-500">Disabled (lg)</span>
                </div>
              </div>
            </ComponentDemo>
          </section>

          <hr />

          {/* Keyboard Controls */}
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold mb-1">Keyboard Controls</h2>
              <p className="text-sm text-gray-600 mb-4">
                Click on a control and use keyboard shortcuts
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-gray-50 rounded-lg">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <kbd className="px-2 py-1 bg-white border rounded text-xs">
                    ← →
                  </kbd>
                  <span className="text-sm">Rotate ±5°</span>
                </div>
                <div className="flex justify-between">
                  <kbd className="px-2 py-1 bg-white border rounded text-xs">
                    Shift + ← →
                  </kbd>
                  <span className="text-sm">Rotate ±15°</span>
                </div>
                <div className="flex justify-between">
                  <kbd className="px-2 py-1 bg-white border rounded text-xs">
                    Ctrl/Cmd + ← →
                  </kbd>
                  <span className="text-sm">Rotate ±1°</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <kbd className="px-2 py-1 bg-white border rounded text-xs">
                    Home
                  </kbd>
                  <span className="text-sm">Go to 0°</span>
                </div>
                <div className="flex justify-between">
                  <kbd className="px-2 py-1 bg-white border rounded text-xs">
                    End
                  </kbd>
                  <span className="text-sm">Go to 180°</span>
                </div>
                <div className="flex justify-between">
                  <kbd className="px-2 py-1 bg-white border rounded text-xs">
                    Page Up/Down
                  </kbd>
                  <span className="text-sm">Rotate ±45°</span>
                </div>
              </div>
            </div>
          </section>

          <hr />

          {/* Interactive Demo */}
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold mb-1">Interactive Demo</h2>
              <p className="text-sm text-gray-600">
                Try dragging the control, clicking on the track, or using
                keyboard shortcuts
              </p>
            </div>
            <ComponentDemo>
              <DegreeControl
                value={rotation}
                onChange={setRotation}
                size="xl"
              />
            </ComponentDemo>
          </section>
        </div>
      </main>
    </TooltipPrimitive.Provider>
  );
}
