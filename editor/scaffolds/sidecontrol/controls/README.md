# Controls & Notes on adding one.

- use `modal={false}`

the portal ui WILL conflict wht the surface event listeners, cansing canvas element behind the ui to be selected, for portal ui, such as Select / Dropdown / etc.

https://github.com/radix-ui/primitives/issues/1785

## Fixed Component Types:

- **DropdownMenu**
  - ext-ops.tsx, ext-zoom.tsx, export.tsx
- **Popover**
  - paint.tsx, fe.tsx, font-family.tsx, color.tsx, corner-radius.tsx
- **Dialog**
  - export.tsx
- **Sheet**
  - richtext.tsx

---

> Select [does not have `modal` option](https://github.com/radix-ui/primitives/issues/1927) - issue open, need to fix this.

- **Select**
  - fe.tsx, font-family.tsx, export.tsx
