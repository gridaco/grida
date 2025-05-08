import { AuthPolicyForm } from "../auth-policy-form";

export default async function EditPolicyPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return (
    <div className="container mx-auto py-4">
      <h1 className="text-2xl font-bold mb-4">Edit Policy</h1>
      <AuthPolicyForm policyId={params.id} />
    </div>
  );
}
