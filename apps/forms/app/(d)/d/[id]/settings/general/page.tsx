import { Select } from "@/components/select";
import { createServerComponentClient } from "@/lib/supabase/server";
import { DeleteFormSection } from "@/scaffolds/settings/delete-form/delete-form-section";
import { cookies } from "next/headers";
import Link from "next/link";

export default async function FormGeneralSettingsPage({
  params,
}: {
  params: { id: string };
}) {
  const cookieStore = cookies();

  const form_id = params.id;

  const supabase = createServerComponentClient(cookieStore);

  const { data } = await supabase
    .from("form")
    .select()
    .eq("id", form_id)
    .single();

  const { redirect_after_response_uri } = data!;

  return (
    <main className="prose">
      <section>
        <header>
          <h2>Data Integrity</h2>
        </header>
        <div className="flex flex-col gap-8">
          <section>
            <h3>Handling unknown fields</h3>
            <p className="opacity-80">
              When a form is submitted with fields that are not defined in the
              form schema, you can choose to ignore them or store them as
              metadata.
            </p>
            <div>
              <label>
                <Select>
                  <option>Accept the form with ignoring unknown fields</option>
                  <option>
                    Reject forms when if any unknown field is present
                  </option>
                </Select>
              </label>
            </div>
          </section>
        </div>
      </section>
      <section>
        <header>
          <h2>Responses</h2>
          <p>Manage how responses are collected and protected</p>
        </header>
        <div className="flex flex-col gap-8">
          <section>Allow response editing</section>
          <section>
            <h3>Limit to 1 response</h3>
            <label className="flex gap-2 items-center cursor-pointer">
              <input type="checkbox" />
              <span>
                Limit to 1 response per user. Users won&apos;t be able to submit
                multiple responses.
              </span>
            </label>
          </section>
          <section>
            <h3>Maximum responses</h3>
            <label className="flex flex-col gap-2 cursor-pointer">
              <span>Maximum number of responses allowed</span>
              <input
                type="number"
                placeholder="Leave empty for unlimited responses"
                min="1"
              />
            </label>
          </section>
        </div>
      </section>
      <section>
        <form action="/private/editor/settings/redirect-uri" method="POST">
          <header>
            <h2>Redirect</h2>
            <p>Customize redirection url after submission</p>
          </header>
          <div className="flex flex-col gap-8">
            <label className="flex flex-col gap-2">
              <input type="hidden" name="form_id" value={form_id} />
              <input
                name="redirect_uri"
                type="text"
                defaultValue={redirect_after_response_uri ?? ""}
                placeholder="https://.."
                pattern="https://.*"
              />
              <span>
                Redirect to a custom URL after form submission. Leave empty for
                default behavior.
              </span>
            </label>
          </div>
          <footer>
            <button type="submit">Save</button>
          </footer>
        </form>
      </section>
      <section>
        <header>
          <h2>Trusted Origins</h2>
          <p>Configure where the form can be embedded</p>
        </header>
        <div className="flex flex-col gap-8">
          <section>
            <h3>Allowed origins</h3>
            <p className="opacity-80">
              Add origins where the form can be embedded. Leave empty to allow
              all origins.
            </p>
            <div>
              <label>
                <textarea />
              </label>
            </div>
          </section>
        </div>
      </section>
      <section>
        <h2>Delete Form</h2>
        <DeleteFormSection />
      </section>
    </main>
  );
}
