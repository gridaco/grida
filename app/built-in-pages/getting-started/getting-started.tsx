import React from "react";
import { Scaffold as BoringScaffold } from "@boringso/react-core";
import { boring_extended_import_design_with_url } from "../getting-started-components";
export function BuiltIn_GettingStarted() {
  const extensions = [boring_extended_import_design_with_url];
  const initialTitle = `Getting Started`;
  const initialContent = `
<h1>Upload your first design</h1>
<p>You can upload design from figma via running the plugin on it. Or the quick handy way is to use below link importer.</p>
<br/>
<br/>
<h1>Too much? - Quick start (30 Seconds)</h1>
<p>Bridged App is an opensource software for Ultimate productivity for startups & application creation. With built-in powerful text editor engine and graphics engine based on Skia 2D Graphics library, we provide the most effecient way to design, to develop the app and to manage the contents Live.</p>
<import-design-with-url/>

  `;
  return (
    <BoringScaffold
      extensions={extensions}
      initialTitle={initialTitle}
      initialContent={initialContent}
    />
  );
}
