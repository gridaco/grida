import { z } from "zod";
import { withTemplate, ZTemplateSchema } from "../with-template";
import React from "react";

const ContainerWidgetSchema = z.object({
  props: z.any(),
  // @ts-ignore
}) satisfies ZTemplateSchema<any>;

type ContainerWidgetProps = z.infer<typeof ContainerWidgetSchema>["props"];

export const ContainerWidget = withTemplate(
  ({ children, ...props }: React.PropsWithChildren<ContainerWidgetProps>) => {
    return (
      <div {...props} style={{ ...props }}>
        {children}
      </div>
    );
  },
  "container",
  // @ts-ignore
  ContainerWidgetSchema
);
