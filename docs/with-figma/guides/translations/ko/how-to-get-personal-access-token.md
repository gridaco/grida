---
title: Figma personal access token 가져오기
description: Grida 워크플로우에서 직접 Figma API 접근이 필요할 때 사용할 personal access token을 생성하는 방법입니다.
keywords:
  - figma
  - personal access token
  - api token
  - grida
format: md
doc_tasks:
  - update
---

# Figma personal access token 가져오기

다음 순서로 Figma personal access token을 생성할 수 있습니다.

1. Figma 계정에 로그인합니다.
2. [Figma developers: personal access tokens](https://www.figma.com/developers/api#access-tokens) 페이지를 엽니다.
3. **Get personal access token**을 클릭합니다.
4. 필요하다면 토큰 이름 또는 라벨을 입력합니다.
5. 생성된 토큰 값을 복사해서 안전한 곳에 보관합니다.

## `personalAccessToken`이 필요한 경우

대부분의 Grida 제품은 기본 Figma 인증 흐름을 사용하지만, 일부 워크플로우에서는 명시적인 `personalAccessToken`이 필요합니다.

대표적인 경우:

- 아직 OAuth 흐름이 완전히 적용되지 않은 내부 또는 베타 기능
- Figma API에 직접 접근하는 스크립트나 도구
- 다른 Figma 계정으로 일시적으로 인증해야 하는 경우

## 보안 주의사항

personal access token은 비밀번호처럼 취급해야 합니다. 공개 문서, 스크린샷, 이슈 댓글에 노출하지 마세요.
