import React from "react";
import { useValue } from "./use";
import { ScopedVariableProvider } from "./context";

interface ArrayMapProps {
  identifier: string;
  expression: string[];
  children: (data: any, index: number) => React.ReactNode;
}

const ArrayMap: React.FC<ArrayMapProps> = ({
  identifier,
  expression,
  children,
}) => {
  const arrayData = useValue(expression as any) || [];

  return (
    <>
      {arrayData.map((item: any, index: number) => (
        <ScopedVariableProvider
          key={index}
          identifier={identifier}
          expression={expression.concat([index.toString()]) as any}
        >
          {children(item, index)}
        </ScopedVariableProvider>
      ))}
    </>
  );
};

export default ArrayMap;
