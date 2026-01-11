import * as React from "react";

/**
 * Reusable layout component for UI component demos.
 *
 * - Centers the component with spacious padding
 * - Provides border instead of background
 * - Keeps notes/text outside the demo area
 */
export function ComponentDemo({
  children,
  notes,
  className,
}: {
  children: React.ReactNode;
  notes?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="space-y-4">
      <div
        className={`flex items-center justify-center min-h-[400px] p-12 border border-gray-200 rounded-lg ${className || ""}`}
      >
        {children}
      </div>
      {notes && <div className="text-sm text-gray-600">{notes}</div>}
    </div>
  );
}
