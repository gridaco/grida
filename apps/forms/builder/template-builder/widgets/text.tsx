import { ZTemplateSchema, withTemplate } from "../with-template";
import { z } from "zod";

const TextSchema = z.object({
  props: z.object({
    text: z.string(),
  }),
}) satisfies ZTemplateSchema<any>;

type TextProps = z.infer<typeof TextSchema>["props"];

export const TextWidget = withTemplate(
  ({ text, ...props }: TextProps) => {
    return (
      <div {...props} style={{ ...props }}>
        {text}
      </div>
    );
  },
  "text",
  TextSchema
);
