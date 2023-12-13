---
title: Hash flag
id: "--hash"
locale: en
stage:
  - proposal
  - draft
  - experimental
  - not-ready
---

# Hash

> Hash is a unique id indicator just like `--id`, but for a asset such as vector & images

## Allowed on

- layer with single image fill (a image)
- a vector layer

## Use with `--main`

```
vector layer 1 --hash=my-brand-logo
vector layer 2 --hash=my-brand-logo --main
```

Now vector 1 & 2 will use the same svg data, based on vector 2's svg data (since it's marked with `--main`).

- do - set one layer as main
- don't - set multiple layer with same hash with main (will show warning)
- don't - no main layer specified - will use the first hit item.

## See also

- [`--id`](./--id/README.md)
