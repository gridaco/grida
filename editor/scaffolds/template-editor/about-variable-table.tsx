import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TemplateVariables } from "@/lib/templating";
import { z } from "zod";

interface AboutVariable {
  key: string;
  description?: string;
  optional: boolean;
}

function flattenSchema(
  schema: any,
  parentKey = "",
  result: AboutVariable[] = []
) {
  Object.keys(schema.shape).forEach((key) => {
    const fullPath = parentKey ? `${parentKey}.${key}` : key;
    const field = schema.shape[key];

    if (field instanceof z.ZodObject) {
      flattenSchema(field, fullPath, result);
    } else {
      const description = field._def?.description || "";
      const optional = !!field.isOptional();
      result.push({ key: fullPath, description, optional });
    }
  });

  return result;
}
export function ContextVariablesTable({
  schema,
}: {
  schema: TemplateVariables.ContextName;
}) {
  const about = flattenSchema(TemplateVariables.schemas[schema]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">key</TableHead>
          <TableHead>description</TableHead>
          <TableHead className="text-right">available</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {about.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="font-medium">
              <code>{row.key}</code>
            </TableCell>
            <TableCell className="text-xs">{row.description}</TableCell>
            <TableCell className="text-right">
              {row.optional ? "depends" : "always"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
