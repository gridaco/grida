import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CSVPreviewProps {
  count: number;
  data: any[];
}

export function SimpleCSVTable({ data, count }: CSVPreviewProps) {
  if (!data || data.length === 0) {
    return <div className="text-center py-4">No data to preview</div>;
  }

  // Get all unique keys from the data
  const allKeys = Array.from(
    new Set(data.flatMap((item) => Object.keys(item)))
  );

  return (
    <Table>
      <TableHeader className="sticky top-0 bg-secondary">
        <TableRow>
          {allKeys.map((key) => (
            <TableHead key={key}>{key}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.slice(0, 5).map((row, index) => (
          <TableRow key={index}>
            {allKeys.map((key) => (
              <TableCell key={`${index}-${key}`}>{row[key] || ""}</TableCell>
            ))}
          </TableRow>
        ))}
        {data.length > 5 && (
          <TableRow>
            <TableCell
              colSpan={allKeys.length}
              className="text-center text-muted-foreground"
            >
              {count - 5} more records not shown in preview
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
