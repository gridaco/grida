import React from "react";
import type { access } from "@grida/tokens";
import { useValue } from "./use";
import { ScopedVariableBoundary } from "./context";

type ScopedExpression =
  access.ScopedIdentifiersContext["scopedIdentifiers"][string];

interface ArrayMapProps {
  identifier: string;
  expression: string[];
  children: (data: unknown, index: number) => React.ReactNode;
}

const ArrayMap: React.FC<ArrayMapProps> = ({
  identifier,
  expression,
  children,
}) => {
  const arrayData: unknown[] = useValue(expression as ScopedExpression) || [];

  return (
    <>
      {arrayData.map((item: unknown, index: number) => (
        <ScopedVariableBoundary
          key={index}
          identifier={identifier}
          expression={expression.concat([index.toString()]) as ScopedExpression}
        >
          {children(item, index)}
        </ScopedVariableBoundary>
      ))}
    </>
  );
};

export default ArrayMap;
