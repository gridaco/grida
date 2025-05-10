"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, MoreHorizontal } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePolicyStore } from "./store";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";

export function AuthPolicyList() {
  const router = useRouter();
  const { policies, deletePolicy } = usePolicyStore();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [policyToDelete, setPolicyToDelete] = useState<string | null>(null);

  const handleDeleteClick = (id: string) => {
    setPolicyToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (policyToDelete) {
      const policyName = policies.find((p) => p.id === policyToDelete)?.name;
      deletePolicy(policyToDelete);
      toast(`Policy [${policyName}] deleted`);
      setPolicyToDelete(null);
    }
    setDeleteDialogOpen(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getChallengeTypeLabel = (type: string) => {
    switch (type) {
      case "passcode":
        return "Passcode";
      case "kba":
        return "KBA";
      case "otp":
        return "OTP";
      case "magic-link":
        return "Magic Link";
      case "basic":
        return "Basic Auth";
      default:
        return type;
    }
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {policies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No authentication policies found.
                </TableCell>
              </TableRow>
            ) : (
              policies.map((policy) => (
                <TableRow key={policy.id}>
                  <TableCell className="font-medium">
                    {policy.name}
                    {policy.description && (
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {policy.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {policy.challenges.map((challenge, index) => (
                      <Badge key={index} variant="outline" className="mr-1">
                        {getChallengeTypeLabel(challenge.type)}
                      </Badge>
                    ))}
                  </TableCell>
                  <TableCell>
                    {policy.scopes.map((scope, index) => (
                      <Badge key={index} variant="secondary" className="mr-1">
                        {scope}
                      </Badge>
                    ))}
                  </TableCell>
                  <TableCell>{formatDate(policy.created_at)}</TableCell>
                  <TableCell>
                    <Switch disabled checked={policy.enabled} />
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <Link href={`./policies/${policy.id}`}>
                          <DropdownMenuItem>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                        </Link>
                        <DropdownMenuItem
                          onClick={() => handleDeleteClick(policy.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete policy?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Sites using this policy will no
              longer be working. Make sure this policy is not in use before
              deleting it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
