# Ignore the target property

As a design choice, for example, a designer can add a boxshadow & radius to the frame of a website design frame. In this case, human developers can easily know that the boxshadow and the raius is a non relavent value and must be ignored. the `--ignore=<property>` flag can be used useful for this case.

---

e.g.

- `--ignore=*` - same as [`//@ignore`](../@ignore/README.md)
- `--ignore=effects`
- `--ignore=border-radius`
