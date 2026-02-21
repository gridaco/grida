---
title: "Grida WEST"
---

```

        ░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓████████▓▒░░▒▓███████▓▒░▒▓████████▓▒░
        ░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░         ░▒▓█▓▒░
        ░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░         ░▒▓█▓▒░
        ░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓██████▓▒░  ░▒▓██████▓▒░   ░▒▓█▓▒░
        ░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░             ░▒▓█▓▒░  ░▒▓█▓▒░
        ░▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░             ░▒▓█▓▒░  ░▒▓█▓▒░
         ░▒▓█████████████▓▒░░▒▓████████▓▒░▒▓███████▓▒░   ░▒▓█▓▒░

```

# [WIP] Grida WEST (`alpha`)

황야의 무법지대, 와일드 웨스트에 오신것을 환영합니다.
Grida WEST 는 유저 게이미피캐이션 서비스로 쿼스트 설정 보상및 리퍼럴 캠페인에 활용될수 있습니다.

Grida WEST 로 서부 개척의 주인공이 되어 보세요 !

**사용 예시**

- 친구 초대 이벤트 - 사용자가 친구를 초대하고, 친구가 특적 미션을 완료할경우 양측 모두 보상을 받을수 있습니다.
- 출석 체크 이벤트 - 일별로 마일스톤을 설정하여 출석 보상을 제공합니다.
- 선착순 추첨 이벤트 - 선착순으로 참여한 사용자에게 추첨을 통해 보상을 제공합니다.

## 퀘스트 설정 및 보상 설정

아래 기능을 조합해, 유연하고 강력한 프로그램을 제작할수 있습니다.

- 추천인 코드 기능 - 사용자별 고유한 초대 코드를 발급하여 사용자별 초대 현황을 트래킹할수 있습니다.
- 초대 기능 - 사용자가 1회성 초대코드를 발급하여 개별적으로 친구를 초대할수 있습니다.
- 상호 보상 기능 - 참여자 모두가 완료한 퀘스트에 대한 보상을 받을수 있도록 설정할수 있습니다.
- 마일스톤 기능 - 퀘스트 별로 마일스톤을 설정하여 특정 마일스톤 이상을 완료해야 보상이 주어지거나, 단계별로 높아지는 보상을 설정할수 있습니다.
- 최대 수량 - 최대 수량을 설정하여 남용을 방지할수 있습니다.
- 커스텀 이벤트 - 커스텀 이벤트를 정의하여 특정 이벤트에 퀘스트가 완료되도록 설정할수 있습니다.
- 자동 추첨 - 자동 추첨을 통해 공정한 보상을 제공할수 있습니다.

## 체널

- default - Grida 에서 기본 제공되는 템플릿을 통해 캠페인을 진행할수 있습니다.
- (지원예정) ~~api - WEST API 를 통해 커스텀 이벤트를 트래킹하고 복잡한 로직을 구현할수 있습니다.~~
- (지원예정) ~~sms - 마케팅 수신 동의를 설정한 사용자에게 문자를 통해 알림을 보낼수 있습니다.~~
- (지원예정) ~~email - 마케팅 수신 동의를 설정한 사용자에게 이메일을 통해 알림을 보낼수 있습니다.~~

## 용어 및 개념

- `challenge` / `quest` - a challenge is a way to `claim` a token - this often requires sign-up to a certain form for paticipant registration and further verification.
- `claim` - anon or authenticated claims a token, the token then becomes `claimed`
  - "claimed" token now requires participant verification for further interaction.
  - the initial tokens can be already-claimed as they are sent to targeted participants (customers / users)
- `mint` - minting refers to creating a new token with minting privileges. A common term for this can be "invite"
  - E.g. participant can `mint` a new token from their claimed token. (pre-populated token) - unique code per invitation.
  - E.g. anon can `mint` a new token from a challenge. (on-the-fly token) - dynamically accepts the invitation, as the token is not pre-populated.
- `redeem` - redeem commonly refers to redeeming the exchange of a token for a reward.
- `reward` - a reward is a virtual or physical exchange of ownership for a token.
  - this can be automatically exchanged with a exchange token (e.g. a coupon code)
  - this can be manually exchanged with a physical item (e.g. a t-shirt) (where administator needs to manually redeem the token and exchange it for goods)
  - this can be a virtual "right" or a "ticket" - e.g, this is a draw ticket for a lottery.
    - in this scenario, the `reward` is considered claimed, and the "draw" is handled by the administrator.

Grida Token Chain is a general-purpose, blockchain-inspired system that is useful when implementing a token-network.

## Series

The series is a collection of tokens, a network. In marketing, it can be a campaign. In ticketing, it can be an event.

The data under series is public.

**series.json**

```json
{
  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "name": "My Campaign",
  "description": "This is a referral marketing campaign",
  "start": "2025-12-25",
  "end": null,
  "metadata": {
    "key": "value"
  }
}
```

## Seed tokens

You can initially create the first token by using array of seed data.
Either set private or public seed data (or both)

**private.json**

```json
{
  "owner": {
    "uid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**public.json**

```json
{
  "owner": {
    "name": "John Doe"
  }
}
```

**token.generated.public.json**

```json
{
  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "series": {
    "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "name": "My Campaign",
    "description": "This is a referral marketing campaign",
    "start": "2025-12-25",
    "end": null,
    "metadata": {
      "key": "value"
    }
  },
  "public": {
    "owner": {
      "name": "John Doe"
    }
  },
  "signature": "0x8f1b3e0d2e567d4c8b1c9e8d5f4a2b7c6d5e4f3a2b1c9d8e7f6a5b4c3d2e1f0a"
}
```
