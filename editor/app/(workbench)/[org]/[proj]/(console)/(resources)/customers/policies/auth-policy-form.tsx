"use client";

import type React from "react";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthPolicyJsonEditor } from "./auth-policy-json-editor";
import { Platform } from "@/lib/platform";
import { usePolicyStore } from "./store";
import toast from "react-hot-toast";

interface AuthPolicyFormProps {
  policyId?: string;
}

export function AuthPolicyForm({ policyId }: AuthPolicyFormProps) {
  const router = useRouter();
  const { getPolicy, addPolicy, updatePolicy } = usePolicyStore();

  const [formData, setFormData] =
    useState<Platform.CustomerAuthPolicy.CustomerAuthPolicy>({
      id: "",
      created_at: "",
      project_id: 1,
      challenges: [{ type: "passcode" }],
      description: "",
      name: "",
      enabled: true,
      scopes: ["read"],
    });

  const availableScopes = [
    { id: "read", label: "Read" },
    { id: "write", label: "Write" },
    { id: "delete", label: "Delete" },
    { id: "admin", label: "Admin" },
  ];

  useEffect(() => {
    if (policyId) {
      const policy = getPolicy(policyId);
      if (policy) {
        setFormData(policy);
      } else {
        // Policy not found, redirect to list
        router.push("/");
      }
    } else {
      const defaultPolicy = {
        id: "",
        created_at: "",
        project_id: 1,
        challenges: [],
        description: "",
        name: "",
        enabled: true,
        scopes: ["read"],
      };
      setFormData(defaultPolicy);
    }
  }, [getPolicy, policyId, router]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleScopeToggle = (scopeId: string, checked: boolean) => {
    if (checked) {
      setFormData({ ...formData, scopes: [...formData.scopes, scopeId] });
    } else {
      setFormData({
        ...formData,
        scopes: formData.scopes.filter((scope) => scope !== scopeId),
      });
    }
  };

  const handleEnabledChange = (checked: boolean) => {
    setFormData({ ...formData, enabled: checked });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Ensure we're using the latest parsed challenges
    const updatedPolicy = { ...formData };

    if (policyId) {
      // Update existing policy
      updatePolicy(updatedPolicy);
      toast.success("Policy updated");
    } else {
      // Create new policy
      addPolicy(updatedPolicy);
      toast.success("Policy created");
    }

    // Redirect back to the list
    router.push("./");
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Policy Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., Customer Portal Access"
                value={formData.name}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="enabled">Status</Label>
              <div className="flex items-center space-x-2 pt-2">
                <Switch
                  id="enabled"
                  checked={formData.enabled}
                  onCheckedChange={handleEnabledChange}
                />
                <Label htmlFor="enabled" className="cursor-pointer">
                  {formData.enabled ? "Enabled" : "Disabled"}
                </Label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Describe the purpose of this authentication policy"
              value={formData.description || ""}
              onChange={handleInputChange}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Access Scopes</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {availableScopes.map((scope) => (
                <div key={scope.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`scope-${scope.id}`}
                    checked={formData.scopes.includes(scope.id)}
                    onCheckedChange={(checked) =>
                      handleScopeToggle(scope.id, checked as boolean)
                    }
                  />
                  <Label
                    htmlFor={`scope-${scope.id}`}
                    className="cursor-pointer"
                  >
                    {scope.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="challenges">
              Challenges (JSON)
              <span className="text-xs text-muted-foreground ml-2">
                Define authentication challenges in JSON format
              </span>
            </Label>
            <AuthPolicyJsonEditor
              defaultValue={formData.challenges}
              onValueChange={(challenges) => {
                setFormData({ ...formData, challenges });
              }}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/")}
          >
            Cancel
          </Button>
          <Button type="submit">
            {policyId ? "Update Policy" : "Create Policy"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
