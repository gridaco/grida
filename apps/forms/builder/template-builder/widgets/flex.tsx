import React from "react";
import { z } from "zod";
import { withTemplate } from "../with-template";

export const FlexWidgetSchema = z.object({
  props: z.object({
    gap: z.number().optional(),
    flexDirection: z.union([z.literal("row"), z.literal("column")]).optional(),
    flexWrap: z.union([z.literal("wrap"), z.literal("nowrap")]).optional(),
    justifyContent: z
      .union([
        z.literal("center"),
        z.literal("start"),
        z.literal("end"),
        z.literal("space-between"),
        z.literal("space-around"),
        z.literal("space-evenly"),
      ])
      .optional(),
    alignItems: z
      .union([
        z.literal("center"),
        z.literal("start"),
        z.literal("end"),
        z.literal("stretch"),
        z.literal("baseline"),
      ])
      .optional(),
  }),
});

type FlexWidgetProps = z.infer<typeof FlexWidgetSchema>["props"];

export const FlexWidget = withTemplate(
  function FlexWidget({
    children,
    ...props
  }: React.PropsWithChildren<FlexWidgetProps>) {
    return (
      <div
        data-widget="flex"
        style={{
          display: "flex",
          ...props,
        }}
      >
        {children}
      </div>
    );
  },
  "flex",
  FlexWidgetSchema
);
