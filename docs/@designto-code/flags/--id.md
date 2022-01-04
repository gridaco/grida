# A Semantic ID Flag

## When to use and what can it do?

by specifing the id flag, you can take advantage in below scenarios.

- Same vector, two different component, one for hover, one for default, only svg color is different. - in this case, you can set the id for both layer as same, so that the component code generation will not include the duplicated svg data / placeholder code.
- id="value" on generated html output.

<!-- TODO: provide more realworld usecase -->

## See also

- [`--hash`](./--hash/README.md)
