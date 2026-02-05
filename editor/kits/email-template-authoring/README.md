### What

`email-template-authoring` is a reusable kit that renders an **email-client-style** template authoring UI:

- an email composer layout (`To`, `Reply-To`, `Subject`, `From name`, `From`, `Body`)

### Why

Multiple parts of the editor may need to author email templates with the same UX. This kit:

- keeps the UX consistent across features
- provides a small controlled API (`state`, `value`, `onValueChange`)
- avoids coupling to global editor/workbench state

### API (high level)

Each field is controlled by:

- `state`: `"disabled" | "off" | "on"`
  - `disabled`: visible but read-only/disabled
  - `off`: hidden
  - `on`: visible and editable
- `value`: field value
- `onValueChange`: receives the new value (when editable)
