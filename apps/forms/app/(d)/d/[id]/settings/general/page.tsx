import { DeleteFormSection } from "@/scaffolds/settings/delete-form/delete-form-section";
import Link from "next/link";

export default function FormGeneralSettingsPage() {
  return (
    <main>
      <section>
        <h2 className="text-xl font-bold py-4">Data Integrity</h2>
        <div className="flex flex-col gap-8">
          <section>
            <h3 className="text-lg">Handling unknown fields</h3>
            <p className="opacity-80">
              When a form is submitted with fields that are not defined in the
              form schema, you can choose to ignore them or store them as
              metadata.
            </p>
            <div>
              <label>
                <select>
                  <option>Accept the form with ignoring unknown fields</option>
                  <option>
                    Reject forms when if any unknown field is present
                  </option>
                </select>
              </label>
            </div>
          </section>
        </div>
      </section>
      <section>
        <h2 className="text-xl font-bold py-4">Delete Form</h2>
        <DeleteFormSection />
      </section>
    </main>
  );
}
