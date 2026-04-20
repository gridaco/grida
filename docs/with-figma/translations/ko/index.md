---
title: Grida와 Figma
description: Assistant 문서, 가져오기 워크플로우, 실무 가이드를 포함한 Grida와 Figma 연동 문서입니다.
keywords:
  - grida
  - figma
  - 가져오기
  - assistant
  - 디자인 워크플로우
format: md
doc_tasks:
  - update
---

# Grida와 Figma

Grida는 Figma와 자연스럽게 연결되어 디자이너가 도구 사이를 오가며 작업할 수 있도록 돕습니다.

> **⚠️ 중요 안내**
>
> Figma 클립보드 연동은 Figma 내부 포맷에 의존하므로 예고 없이 변경될 수 있습니다. Figma에서 붙여넣기가 갑자기 동작하지 않으면 [이슈를 남겨 주세요](https://github.com/gridaco/grida/issues/new).

## 기능

### Assistant

현재 유지 관리되는 Grida Assistant 문서는 다음 위치에 있습니다.

- [Assistant](./assistant/01-intro.mdx)
- [Design Assistant](./assistant/design-assistant/index.mdx)

### Figma에서 가져오기

Figma에서 노드를 복사한 뒤 Grida에 바로 붙여넣을 수 있습니다. 에디터는 Figma 클립보드 포맷을 자동으로 감지하고 Grida 포맷으로 변환하며, 다음 정보를 최대한 유지합니다.

- 노드 계층 구조
- 시각 속성(채우기, 스트로크, 효과, 변형)
- 텍스트 스타일과 내용
- 벡터 데이터와 경로
- 컴포넌트 관계

**자세히 보기**: [Figma에서 복사 & 붙여넣기](../editor/features/copy-paste-figma.md)

### 지원 노드 유형

Grida는 일반적인 Figma 노드 유형을 가져올 수 있습니다.

- **컨테이너**: Frame, Component, Component Instance, Section, Group
- **도형**: Rectangle, Ellipse, Line, Polygon, Star
- **벡터**: Vector path, Boolean operation
- **텍스트**: 스타일을 유지한 Text node

### 속성 호환성

변환 파이프라인은 다음과 같은 Figma 속성을 Grida 속성으로 매핑합니다.

- **효과**: Drop shadow, inner shadow, layer blur, background blur
- **스트로크**: 두께, 정렬, cap, join, dash pattern, miter limit
- **채우기**: 단색, 그라디언트(linear, radial, angular, diamond), 이미지
- **코너**: 반경, smoothing, 개별 코너 반경
- **변형**: 위치, 크기, 회전(matrix에서 추출)

## 가이드

- [Figma personal access token 가져오기](./guides/how-to-get-personal-access-token.md)
- [공유 가능한 Figma 디자인 링크 가져오기](./guides/how-to-get-sharable-design-link.md)
- [로컬 `.fig` 파일 저장하기](./guides/how-to-get-fig-file.md)

## 기술 세부사항

구현 세부사항과 변환 파이프라인 구조는 다음 문서를 참고하세요.

- [Figma 가져오기 기술 문서](../editor/features/copy-paste-figma.md)
- [Figma IO 패키지 문서](https://grida.co/docs/reference/io-figma)
