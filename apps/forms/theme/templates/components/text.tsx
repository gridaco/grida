import {
  ZTemplateSchema,
  withTemplate,
} from "@/scaffolds/canvas/with-template";
import { z } from "zod";

const TextSchema = z.object({
  props: z.object({
    text: z.string(),
  }),
}) satisfies ZTemplateSchema<any>;

type TextProps = z.infer<typeof TextSchema>["props"];

export const Text = withTemplate(
  ({ text, ...props }: TextProps) => {
    return <div {...props}>{text}</div>;
  },
  "text",
  TextSchema
);
{
  /* <h2 className="text-2xl font-semibold">Upcoming Events</h2>; */
}
