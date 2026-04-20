---
title: 응답자 이메일 알림
description: Grida Forms에서 폼 제출 후 응답자에게 맞춤 확인 이메일을 보내는 방법을 설명합니다. CIAM 검증 이메일이 필요합니다.
keywords:
  - grida
  - forms
  - 이메일 알림
  - 응답자 이메일
  - ciam
format: md
doc_tasks:
  - update
---

### 응답자 이메일 알림

응답자 이메일 알림을 사용하면 폼을 제출한 사람에게 **맞춤 확인 이메일**을 보낼 수 있습니다.

이 기능은 다음과 같은 회원가입 또는 등록 폼에 유용합니다.

- 제출이 정상적으로 완료되었음을 확인하기
- 다음 단계를 안내하기
- 제출 ID 같은 참조 정보를 전달하기

### 시작하기 전에 확인할 점 (CIAM / 검증된 이메일)

Grida는 **CIAM을 사용하는 경우에만**, 그리고 응답자의 이메일이 **검증된 경우에만** 응답자 이메일을 발송합니다.

실제로는 다음을 의미합니다.

- 폼에 `challenge_email` 필드가 있어야 합니다
- 이메일은 임의의 입력 필드가 아니라 제출에 연결된 **검증된 이메일 주소**로 발송됩니다

### 응답자 이메일 알림 활성화 방법

1. Grida 에디터에서 **Form**을 엽니다.
2. 왼쪽 사이드바에서 [**Connect**](https://grida.co/_/connect)를 클릭합니다.
3. [**Channels**](https://grida.co/_/connect/channels)를 클릭합니다.
4. **Email Notifications** 아래에서 **Respondent email notifications**를 찾습니다.
5. **Enable** 토글을 켭니다.
6. **Save**를 클릭합니다.

### 이메일 내용 커스터마이즈 방법

1. 위와 동일하게 [**Connect → Channels**](https://grida.co/_/connect/channels) → **Email Notifications**로 이동합니다.
2. 다음 항목을 설정합니다.
   - **Reply-To** (선택): 회신을 받을 주소. 예: `support@yourdomain.com`
   - **Subject**: 이메일 제목 템플릿
   - **From name** (선택): 발신자 표시 이름. 예: `Acme Support`
   - **Body (HTML)**: 이메일 본문 템플릿(HTML)
3. 내장 미리보기로 제목과 본문을 확인합니다.
4. **Save**를 클릭합니다.

### 어떤 이메일이 발송되나요? (요약)

- **수신자**: 응답자의 **검증된 이메일 주소** (CIAM)
- **발신 이메일**: 고정된 no-reply 주소. 표시 이름은 **From name**으로 바꿀 수 있습니다
- **발송 시점**: 폼 제출이 성공한 뒤
  - CIAM이 없거나 이메일이 검증되지 않았다면 발송은 건너뜁니다

### 템플릿 변수 (Handlebars)

제목과 본문은 모두 템플릿 변수를 지원합니다.

#### 사용 가능한 변수

- `{{form_title}}`
- `{{response.idx}}` (형식화된 제출 순번)
- `{{fields.<field_name>}}` (필드 이름 기준 제출 값)

#### 예시

제목:

```txt
{{form_title}} 등록이 완료되었습니다
```

본문 (HTML):

```html
<h1>{{fields.first_name}}님, 감사합니다!</h1>
<p>{{form_title}} 제출이 정상적으로 접수되었습니다.</p>
<p>등록 번호: {{response.idx}}</p>
```

### 문제 해결

이메일이 발송되지 않는다면 다음을 확인하세요.

- **CIAM 미사용**: 폼에 `challenge_email` 필드가 포함되어 있는지 확인하세요
- **이메일 미검증**: 응답자가 이메일 검증을 완료해야 합니다. 검증되지 않은 이메일은 건너뜁니다
- **본문 템플릿 누락**: 본문이 비어 있으면 발송이 건너뜁니다
- **전송 안정성**: 현재 발송은 인라인 best-effort 방식입니다. 추후 재시도나 큐 처리 방식이 추가될 수 있습니다
