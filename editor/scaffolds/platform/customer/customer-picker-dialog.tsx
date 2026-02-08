"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-editor/dialog";
import { Progress } from "@/components/ui-editor/progress";
import {
  CustomerTable,
  useCustomerTable,
} from "@/scaffolds/grid/wellknown/customer-grid";
import { toast } from "sonner";

interface CustomerPickerDialogProps extends React.ComponentProps<
  typeof Dialog
> {
  onImport: (ids: string[]) => Promise<boolean>;
}

export function CustomerPickerDialog({
  onImport,
  ...props
}: CustomerPickerDialogProps) {
  return (
    <Dialog {...props}>
      <DialogContent className="sm:max-w-[90vw] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Import Customers</DialogTitle>
          <DialogDescription>
            Select customers to add as participants to your campaign. Use
            filters to narrow down by tags, name, or email.
          </DialogDescription>
        </DialogHeader>
        <CustomerTable.Provider>
          <CustomerPickerBody onImport={onImport} />
        </CustomerTable.Provider>
      </DialogContent>
    </Dialog>
  );
}

function CustomerPickerBody({
  onImport,
}: Pick<CustomerPickerDialogProps, "onImport">) {
  const { selection, hasSelection } = useCustomerTable();
  const [importing, setImporting] = useState(false);
  const [importComplete, setImportComplete] = useState(false);
  const [importCount, setImportCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleImportSelected = async () => {
    setImporting(true);
    setError(null);
    const ids = Array.from(selection);
    const ok = await onImport(ids);
    setImporting(false);
    if (ok) {
      setImportComplete(true);
      setImportCount(ids.length);
    } else {
      setError("Failed to import customers");
      toast.error("Failed to import customers");
    }
  };

  const handleReset = () => {
    setImportComplete(false);
    setImporting(false);
    setError(null);
    setImportCount(0);
  };

  if (importing || importComplete || error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="space-y-4 text-center max-w-md w-full">
          {importing ? (
            <>
              <h3 className="text-xl font-medium">Importing Customers...</h3>
              <p className="text-muted-foreground">
                Please wait while we add the selected customers to your
                campaign.
              </p>
              <div className="w-full mt-4">
                <Progress indeterminate className="h-2" />
              </div>
            </>
          ) : error ? (
            <>
              <div className="flex justify-center mb-4">
                <div className="bg-red-100 dark:bg-red-950 p-4 rounded-full">
                  <X className="size-10 text-red-600" />
                </div>
              </div>
              <h3 className="text-xl font-medium">Import Failed</h3>
              <p className="text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={handleReset}>
                Try Again
              </Button>
            </>
          ) : (
            <>
              <div className="flex justify-center mb-4">
                <div className="bg-green-100 dark:bg-green-950 p-4 rounded-full">
                  <Check className="size-10 text-green-600" />
                </div>
              </div>
              <h3 className="text-xl font-medium">Import Complete!</h3>
              <p className="text-muted-foreground">
                {importCount}{" "}
                {importCount === 1 ? "customer has" : "customers have"} been
                successfully added to the campaign.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="px-4 min-h-11 h-11 flex items-center gap-4 border-b">
        {hasSelection ? (
          <CustomerTable.SelectionBar />
        ) : (
          <CustomerTable.Toolbar />
        )}
      </div>
      <CustomerTable.FilterChips />
      <CustomerTable.LoadingLine />
      {/* Grid: fill available space so react-data-grid can scroll */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <CustomerTable.Grid />
      </div>
      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t bg-background gap-4">
        <div className="flex items-center gap-4">
          <CustomerTable.Footer />
        </div>
        <Button onClick={handleImportSelected} disabled={!hasSelection}>
          Import Selected ({selection.size})
        </Button>
      </div>
    </div>
  );
}
