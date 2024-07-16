import { FinalProps, ZTemplateSchema, withTemplate } from "../with-template";
import { z } from "zod";

const TextSchema = z.object({
  properties: z.object({
    text: z.string(),
  }),
}) satisfies ZTemplateSchema<any>;

type TextProps = z.infer<typeof TextSchema>["properties"];

export const TextWidget = withTemplate(
  ({ properties: { text }, style, ...props }: FinalProps<TextProps>) => {
    return (
      <div {...props} style={style}>
        {text}
      </div>
    );
  },
  "text",
  TextSchema
);
