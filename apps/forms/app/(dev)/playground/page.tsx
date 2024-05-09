"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Editor, useMonaco } from "@monaco-editor/react";
import { useEffect, useState } from "react";

export default function FormsPlayground() {
  const [action, setAction] = useState<string>("");
  const [method, setMethod] = useState<string>("get");

  return (
    <main className="container mx-auto">
      <div className="p-10">
        <header className="py-4 flex flex-col">
          <h1 className="text-xl font-bold">Grida Forms Playground</h1>
          <FormJsonEditor />
          <div>
            <input
              type="text"
              placeholder="Action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
            <Select value={method} onValueChange={(value) => setMethod(value)}>
              <SelectTrigger id="method" aria-label="select method">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="get">GET</SelectItem>
                <SelectItem value="post">POST</SelectItem>
                <SelectItem value="put">PUT</SelectItem>
                <SelectItem value="delete">DELETE</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </header>
        <form action={action} method={method}>
          <label>
            Email
            <input type="email" name="email" />
          </label>
          <button>Submit</button>
        </form>
      </div>
    </main>
  );
}

const schema = {
  uri: "https://forms.grida.co/schema/form.schema.json",
  fileMatch: ["*"], // Associate with all JSON files
};

function FormJsonEditor() {
  const monaco = useMonaco();

  useEffect(() => {
    monaco?.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      schemas: [schema],
    });
  }, [monaco]);

  return <Editor height={500} defaultLanguage="json" />;
}
