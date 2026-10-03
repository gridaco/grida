import { FormRenderTree } from "./render";
import { projectFormField } from "./projection";
import type { FormBlock, FormFieldDefinition } from "./model";

describe("public Forms rendering", () => {
  const option = {
    id: "option",
    value: "choice",
    label: "Choice",
    src: "https://example.com/option.png",
    optgroup_id: "group",
    index: 0,
    attribute_id: "private-attribute",
  };
  const field: FormFieldDefinition & { project_id: number } = {
    id: "field",
    local_index: 0,
    name: "answer",
    type: "select",
    required: true,
    readonly: false,
    options: [option],
    optgroups: [{ id: "group", label: "Group" }],
    v_value: "computed",
    project_id: 99,
    storage: {
      type: "grida",
      bucket: "private",
      path: "secret",
      mode: "staged",
    },
    reference: {
      type: "x-supabase",
      schema: "private",
      table: "secret",
      column: "id",
    },
  };

  it("keeps option images, groups and expressions while projecting nested database fields", () => {
    const renderer = new FormRenderTree("form", "Title", null, "en", [field]);
    const block = renderer.blocks()[0];
    expect(block).toMatchObject({
      type: "field",
      field: {
        id: "field",
        v_value: "computed",
        options: [{ src: option.src, optgroup_id: "group" }],
        optgroups: [{ id: "group", label: "Group" }],
      },
    });
    const serialized = JSON.stringify({
      fields: [projectFormField(field)],
      blocks: renderer.blocks(),
      tree: renderer.tree(),
    });
    for (const name of [
      "project_id",
      "attribute_id",
      "storage",
      "reference",
      "secret",
    ]) {
      expect(serialized).not.toContain(name);
    }
  });

  it("preserves section visibility, file strategies and hierarchy", () => {
    const common = {
      form_id: "form",
      form_page_id: "page",
      created_at: "2026-01-01",
      data: null,
    };
    const blocks: FormBlock[] = [
      {
        ...common,
        id: "section",
        type: "section",
        local_index: 0,
        parent_id: null,
        v_hidden: false,
      },
      {
        ...common,
        id: "input",
        type: "field",
        form_field_id: "field",
        local_index: 1,
        parent_id: "section",
      },
    ];
    const renderer = new FormRenderTree(
      "form",
      "Title",
      null,
      "en",
      [{ ...field, type: "file" }],
      blocks,
      undefined,
      {
        option_renderer: (value) => value,
        file_uploader: (id) => ({
          type: "requesturl",
          request_url: `https://api.example.com/upload/${id}`,
        }),
        file_resolver: (id) => ({
          type: "requesturl",
          resolve_url: `https://api.example.com/preview/${id}`,
        }),
      }
    );
    expect(renderer.tree()).toMatchObject({
      depth: 1,
      children: [
        {
          id: "section",
          v_hidden: false,
          children: [
            {
              id: "input",
              field: {
                upload: { request_url: "https://api.example.com/upload/field" },
                resolve: {
                  resolve_url: "https://api.example.com/preview/field",
                },
              },
            },
          ],
        },
      ],
    });
  });

  it("keeps only the declared phone and payment widget configuration", () => {
    expect(
      projectFormField({
        ...field,
        type: "tel",
        data: { default_country: "KR", private_key: "secret" },
      }).data
    ).toEqual({ default_country: "KR" });
    expect(
      projectFormField({
        ...field,
        type: "payment",
        data: {
          type: "payment",
          service_provider: "tosspayments",
          private_key: "secret",
        },
      }).data
    ).toEqual({ type: "payment", service_provider: "tosspayments" });
  });
});
