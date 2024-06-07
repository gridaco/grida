"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { insert } from "@/lib/supabase-postgrest/postgrest";

export default function PostgrestPage() {
  const onSubmit = async (e: any) => {
    e.preventDefault();

    const url = e.target.url.value;
    const key = e.target.key.value;
    const table = e.target.table.value;
    const data = JSON.parse(e.target.data.value);

    insert({
      url,
      table,
      schema: "public",
      data,
      apiKey: key,
    }).then((res) => {
      console.log(res);
    });
  };

  return (
    <main className="p-4">
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="url">postgREST URL</Label>
          <Input name="url" />
        </div>
        <div>
          <Label htmlFor="key">Anon Key</Label>
          <Input name="key" />
        </div>
        <hr />
        <div>
          <Label htmlFor="table">Table</Label>
          <Input name="table" />
        </div>
        <div>
          <Label htmlFor="data">Data JSON</Label>
          <Textarea name="data" />
        </div>
        {/*  */}
        <Button>Submit</Button>
      </form>
    </main>
  );
}
