import {
  PropsWithStyle,
  ZTemplateSchema,
  withTemplate,
} from "../with-template";
import { z } from "zod";

const TextSchema = z.object({
  properties: z.object({
    text: z.string(),
  }),
}) satisfies ZTemplateSchema<any>;

type TextProps = z.infer<typeof TextSchema>["properties"];

export const TextWidget = withTemplate(
  ({ text, style, ...props }: PropsWithStyle<TextProps>) => {
    const children = text.toString();

    return (
      <div {...props} style={style}>
        {children}
      </div>
    );
  },
  "text",
  TextSchema
);
