import { AuthPolicyForm } from "../auth-policy-form";

export default function EditPolicyPage({ params }: { params: { id: string } }) {
  return (
    <div className="container mx-auto py-4">
      <h1 className="text-2xl font-bold mb-4">Edit Policy</h1>
      <AuthPolicyForm policyId={params.id} />
    </div>
  );
}
