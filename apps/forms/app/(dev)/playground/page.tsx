"use client";

import { useState } from "react";

export default function FormsPlayground() {
  const [action, setAction] = useState<string>("");
  const [method, setMethod] = useState<string>("GET");

  return (
    <main className="container mx-auto">
      <div className="p-10">
        <header className="py-4 flex flex-col">
          <h1 className="text-xl font-bold">Grida Forms Playground</h1>
          <div>
            <input
              type="text"
              placeholder="Action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
            </select>
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
