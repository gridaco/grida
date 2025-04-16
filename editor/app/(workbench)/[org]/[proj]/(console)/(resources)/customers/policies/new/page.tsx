import { AuthPolicyForm } from "../auth-policy-form";

export default function NewAuthPolicyPage() {
  return (
    <div className="container mx-auto py-4">
      <h1 className="text-2xl font-bold mb-4">Create New Policy</h1>
      <AuthPolicyForm />
    </div>
  );
}
