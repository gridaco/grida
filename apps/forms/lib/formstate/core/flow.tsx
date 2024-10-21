import React, { createContext, useContext, useMemo } from "react";
import { defineStepper, Stepper, Step } from "@stepperize/react";

interface IAgentFlowContext {
  prev: () => void;
  next: () => void;
}
const Context = createContext<IAgentFlowContext | null>(null);

/**
 * AgentPagesFlow is a flow that is used to navigate through the agent pages.
 * IMPORTANT: this does not contribute to navigating between the form sections.
 *
 * page is a indipendent documents with different renderers
 */
export function AgentPagesFlow({
  pages,
}: {
  pages: { start?: React.ReactNode; main: React.ReactNode };
}) {
  const { Scoped, useStepper } = useMemo(
    () =>
      defineStepper(
        ...([
          pages.start ? { id: "start", page: pages.start } : undefined,
          { id: "main", page: pages.main },
        ].filter(Boolean) as Step[])
      ),
    []
  );

  const { next, prev, current } = useStepper();

  return (
    <Context.Provider value={{ next, prev }}>
      <Scoped>
        {current.id === "start" && pages.start}
        {current.id === "main" && pages.main}
      </Scoped>
    </Context.Provider>
  );
}

export function useAgentFlow() {
  const context = useContext(Context);
  if (!context) {
    throw new Error("useAgentFlow must be used within a AgentFlow");
  }

  const { next, prev } = context;

  return useMemo(() => ({ next, prev }), [next, prev]);
}
