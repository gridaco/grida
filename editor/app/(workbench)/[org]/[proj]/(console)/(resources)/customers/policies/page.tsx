import { Button } from "@/components/ui/button";
import { AuthPolicyList } from "./auth-policy-list";
import { PlusIcon } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="container mx-auto py-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Auth Policies</h1>
        <Link href="./policies/new">
          <Button size="sm">
            <PlusIcon className="mr-2 size-4" />
            New Policy
          </Button>
        </Link>
      </div>
      <AuthPolicyList />
    </div>
  );
}
