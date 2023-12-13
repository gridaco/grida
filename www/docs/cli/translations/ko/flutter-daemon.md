# `grida flutter daemon`

로컬에서 웹 에디터를 위해 flutter daemon 인스턴스를 실행시킵니다.
로컬 데몬을 사용하면 핫리로딩이 활성화 되며, 리모트 서버를 거치지 않고, 지연 없이 앱 빌드가 가능합니다.

시작하려면,

```bash
grida flutter daemon
```

종료하려면, `ctrl+c`.

## 에디터

데몬이 실행되면 (기본 포트 43070) 웹 에디터, 예를 들어서 code.grida.co 를 사용할 수 있습니다. grida 웹 에디터는 자동으로 로컬에서 실행되는 데몬 서버에 접근합니다.

> 포트를 변경하지 마십시오. [`@flutter-daemon/client`](https://github.com/gridaco/flutter-builder/tree/main/packages/flutter-daemon-client) 를 사용하여 자신만의 클라이언트를 구축하는것이 아니라면, 포트를 수정하지 마세요.

## 이 명령어를 실행해야 하나요?

아래 이유에서 로컬 데몬서버를 실행하는것이 권장됩니다. (로컬 머신의 성능이 아주 나쁘지 않을경우)

- 훨신 빠릅니다. (일반적으로 10배 빠릅니다) - [dartpad.dev](https://dartpad.dev) 를 사용해보셨다면 얼마나 렌더까지 오래걸리는지 아실수 있습니다. 데몬은 로컬에서 실행되고 핫리로딩이 지원됨으로 훨신 빠른 개발이 가능합니다.
- 로컬 데몬을 실행시킬경우 디버깅이 가능해 집니다.
- 모든 플랫폼 빌드 가능 - 웹 이외의 환경에서 앱을 실행시키는것이 가능해집니다. - (예. android, ios, mac, win, linux etc)

> 준비중: 아직 web-server 만 지원하기에, 디버깅과 디바이스 미러링은 지원되고 있지 않습니다.

## 같이 보기

- https://github.com/gridaco/code/pull/174
