# `--scope` Flag (Draft)

A Scope specification is a general-perpose flag that can be used to specify a scope of a component or a content.

```

```

## Reserved Keywords

- this - `--scope=this`
- parent - `--scope=parent`
- screen - `--scope=screen`
- frame - `--scope=frame`

## Examples

```
--scope=hero-sections
--id=contents-layout
```

> this will create a namespace with `hero-sections.contents-layout`. With real-world example, scope and id can be used to indicate the duplicated layouts on breakpoints are the same layer, which needs only the style to be differenciated.
