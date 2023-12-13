---
title: Root flag
id: "--root"
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

# `--root` Flag (Draft)

`--root` 플래그는 명시된 레이아웃을 루트로써 인식하도록 합니다.
이는 디자인에서 Variant 를 만들때 Base Component 들을 인스턴스화 한것을 컴포넌트셋 (Variant) 으로 만들때 불필요한 감싸기 Frame 이 생성되는것을 코드생성시 무시하기 위함입니다. Layer tree 상에 `--root` 플래그가 하나라도 명시되어있다면, 가장 첫번째로 탐색된 트리상 상위에 있는 레이어를 Root 로 인식하고, 그 위로는 삭제 처리합니다. (실제 디자인에 영향은 없습니다.) 다른 말로 하자면, `--root` 가 명시되어있다면, "나 위로 모두 무시하시오." 와 같은 뜻입니다.

## Syntax

```ts
`--root` | `--root=${typeof boolean}` | `--root=<strategy-id>`;
```

## Example

```
--root
--root=true
--root=false
--root=use-static-strategy
```

## See also

- [`--unwrap`](--unwrap)
