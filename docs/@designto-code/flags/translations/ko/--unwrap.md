---
title: Unwrap flag
id: "--unwrap"
locale: ko
locales:
  - en
  - ko
stage:
  - draft
  - staging
  - proposal
  - experimental
---

# `--unwrap` 플래그

`--unwrap` 플래그는 Unwrap 될 상대, 즉 Parent 의 속성을 가지는 컨테이너에 적용되며, 적용되면 나 자신을 무시하고 직계 자손으로 스킵하도록 하는 플래그입니다. 이는 디자인 툴에서 유틸리티성, 즉 실제 코드에는 반영이 될필요가 없거나 반영되어서는 안되는 레이아웃이 있을때, 지정하여 자식을 대신 인식하도록 할때 유리합니다.

예시로, Variant Set 을 만들때, Base component 의 인스턴스를 다시 컴포넌트화 시킨다면, 해당 컴포넌트는 불필요한 Frame 이 감싸게 됩니다. 이때 `--unwrap` 을 지정하여, 인스턴스가 바로 인식되도록 할수 있습니다.

**Accepted keys**

- `--unwrap`

## Syntax

```ts
`--unwrap${"="typeof boolean}`
```

**Example**

```
--unwrap

--unwrap=true
--unwrap=false

--unwrap=yes
--unwrap=no

----unwrap
```

## See also

- [`--root`](../--root)
- [`concepts/variants`](https://grida.co/docs/concepts/variants)
