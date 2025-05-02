# API - Working draft

API Working Draft for Grida React Canvas

**Insert custom node**

```tsx
const editor = useEditor({
  components: {
    custom: CustomNode,
  },
});

editor.insertNode({
  type: "custom",
});
```
