# `--responsive-part-id` Flag (Draft)

> This flag is part of id indicator family

While designing responsive screen with breakpoints, you can use this flag to specify the id of a layer that should match other breakpoints' hierarchy to generate unified responsive style code.

## Example

```
# on section hero, size of 1440, xl
--responsive-part-id=hero-section
--breakpoint=xl

# on section hero, size of 1280, lg
--responsive-part-id=hero-section
--breakpoint=lg

# on section hero, size of 1024, md
--responsive-part-id=hero-section
--breakpoint=md

# on section hero, size of 768, sm
--responsive-part-id=hero-section
--breakpoint=sm

# on section hero, size of 320, xs
--responsive-part-id=hero-section
--breakpoint=xs
```
