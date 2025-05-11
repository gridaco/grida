"use client";

import { useState } from "react";
import { Check, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui-editor/progress";
import { SearchInput } from "@/components/extension/search-input";
import { useCustomers } from "./use-customer-feed";
import { useProject } from "@/scaffolds/workspace";
import { format } from "date-fns";
import { toast } from "sonner";

export function ImportFromCustomersDialog({
  onImport,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  onImport: (ids: string[]) => Promise<boolean>;
}) {
  const project = useProject();
  const customers = useCustomers(project.id, {
    q_page_index: 0,
    q_page_limit: 1000,
    q_refresh_key: 0,
    q_orderby: {},
    q_predicates: [],
    q_text_search: null,
  });

  const [activeTab, setActiveTab] = useState("select");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importComplete, setImportComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name?.toLowerCase().includes(search.toLowerCase()) ||
      customer.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectAll = () => {
    if (selection.length === filteredCustomers.length) {
      setSelection([]);
    } else {
      setSelection(filteredCustomers.map((customer) => customer.uid));
    }
  };

  const handleSelectCustomer = (id: string) => {
    if (selection.includes(id)) {
      setSelection(selection.filter((customerId) => customerId !== id));
    } else {
      setSelection([...selection, id]);
    }
  };

  const handleImport = () => {
    setActiveTab("importing");
    setImporting(true);
    onImport(selection).then((ok) => {
      setImporting(false);
      if (ok) {
        setImportComplete(true);
      } else {
        setError("Failed to import customers");
        toast.error("Failed to import customers");
      }
    });
  };

  return (
    <Dialog {...props}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import Referrers</DialogTitle>
          <DialogDescription>
            Add existing customers as referrers to your campaign.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="select" disabled={importing || importComplete}>
              1. Select Customers
            </TabsTrigger>
            <TabsTrigger
              value="review"
              disabled={selection.length === 0 || importing || importComplete}
            >
              2. Review Selection
            </TabsTrigger>
            <TabsTrigger
              value="importing"
              disabled={!importing && !importComplete}
            >
              3. Import
            </TabsTrigger>
          </TabsList>

          <TabsContent value="select" className="space-y-4 py-4">
            <div className="flex items-center w-full">
              <SearchInput
                className="w-max"
                placeholder="Search customers"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="rounded-md border">
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-secondary z-10">
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={
                            selection.length > 0 &&
                            selection.length === filteredCustomers.length
                          }
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Last Seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.length > 0 ? (
                      filteredCustomers.map((customer) => (
                        <TableRow key={customer.uid}>
                          <TableCell>
                            <Checkbox
                              checked={selection.includes(customer.uid)}
                              onCheckedChange={() =>
                                handleSelectCustomer(customer.uid)
                              }
                            />
                          </TableCell>
                          <TableCell>{customer.name}</TableCell>
                          <TableCell>{customer.email}</TableCell>
                          <TableCell>
                            {format(
                              new Date(customer.last_seen_at),
                              "MMM dd, yyyy"
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
                          No customers found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {selection.length} customers selected
              </div>
              <Button
                onClick={() => setActiveTab("review")}
                disabled={selection.length === 0}
              >
                Continue
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="review" className="space-y-4 py-4">
            <div className="space-y-4">
              <div className="rounded-md border p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">
                    Selected Customers ({selection.length})
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab("select")}
                  >
                    Edit Selection
                  </Button>
                </div>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {customers
                      .filter((customer) => selection.includes(customer.uid))
                      .map((customer) => (
                        <div
                          key={customer.uid}
                          className="flex items-center justify-between border-b pb-2"
                        >
                          <div>
                            <div className="font-medium">{customer.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {customer.email}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleSelectCustomer(customer.uid)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="rounded-md border p-4 bg-muted/50">
                <div className="flex items-start gap-2">
                  <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <h4 className="font-medium">Import Information</h4>
                    <p className="text-sm text-muted-foreground">
                      Selected customers will be added as participants to the
                      campaign. They will receive campaign communications based
                      on the campaign settings.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setActiveTab("select")}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={selection.length === 0}>
                Import Customers
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="importing" className="space-y-4 py-4">
            <div className="space-y-4 text-center py-8">
              {importing ? (
                <>
                  <h3 className="text-xl font-medium">
                    Importing from Customers...
                  </h3>
                  <p className="text-muted-foreground">
                    Please wait while we add the selected customers to your
                    campaign.
                  </p>
                  <div className="w-full max-w-md mx-auto mt-4">
                    <Progress indeterminate className="h-2" />
                    <p className="text-sm text-muted-foreground mt-2">
                      Importing {selection.length} customers
                    </p>
                  </div>
                </>
              ) : (
                <>
                  {error ? (
                    <>
                      <div className="flex justify-center mb-4 bg-red-100 p-4 rounded-full w-20 h-20 mx-auto">
                        <X className="size-10 text-red-600" />
                      </div>
                      <h3 className="text-xl font-medium">Failed</h3>
                      <p className="text-muted-foreground">Please try again.</p>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-center mb-4 bg-green-100 p-4 rounded-full w-20 h-20 mx-auto">
                        <Check className="size-10 text-green-600" />
                      </div>
                      <h3 className="text-xl font-medium">Import Complete!</h3>
                      <p className="text-muted-foreground">
                        {selection.length} customers have been successfully
                        added to the campaign.
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
