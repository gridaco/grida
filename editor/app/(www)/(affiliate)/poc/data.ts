export const demo_1_categories = [
  "이벤트",
  "스포츠",
  "음악",
  "패션",
  "미술",
  "사이버펑크",
];

export const imagesDemo1 = {
  이벤트:
    "/affiliate/poc/images/demo-1-images/formbuilder-section-event-image.png",
  스포츠:
    "/affiliate/poc/images/demo-1-images/formbuilder-section-sports-image.png",
  음악: "/affiliate/poc/images/demo-1-images/formbuilder-section-music-image.png",
  패션: "/affiliate/poc/images/demo-1-images/formbuilder-section-fashion-image.png",
  미술: "/affiliate/poc/images/demo-1-images/formbuilder-section-art-image.png",
  사이버펑크:
    "/affiliate/poc/images/demo-1-images/formbuilder-section-cyberfunk-image.png",
};

export const demo_2_categories = [
  "캠페인 매니저",
  "대용량 트래픽",
  "티켓/인벤토리",
  "고객관리",
  "개발자",
];

interface DemoCardData {
  artwork: string;
  title: string;
  description: string;
}

export const imagesDemo2: Record<
  string,
  {
    main: {
      text: string[];
      highlightColorStops: [string, string, string];
      artwork: string;
    };
    subs: DemoCardData[];
  }
> = {
  "캠페인 매니저": {
    main: {
      text: ["플랜", "프리뷰", "오픈"],
      highlightColorStops: ["from-orange-600", "via-red-500", "to-orange-400"],
      artwork: "/affiliate/poc/images/demo-2-images/campaign-image-main.png",
    },
    subs: [
      {
        title: "멀티 캠페인",
        description:
          "여러 폼을 생성할 필요없이, 하나의 폼으로 여러 채널에서 캠페인을 동시에 관리할 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/campaign-image-sub1.png",
      },
      {
        title: "스케줄링",
        description: "캠페인 별로 스케줄을 설정하여 관리할 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/campaign-image-sub2.png",
      },
      {
        title: "대기열 알림",
        description:
          "사용자가 대기열에 등록하여 접수가 시작될 때 알림을 받을 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/campaign-image-sub3.png",
      },
    ],
  },
  "대용량 트래픽": {
    main: {
      text: ["강력한", "큐 관리"],
      highlightColorStops: ["from-blue-700", "via-blue-500", "to-green-400"],
      artwork: "/affiliate/poc/images/demo-2-images/traffic-image-main.png",
    },
    subs: [
      {
        title: "시뮬레이터",
        description:
          "시스템이 작동하지 않을까봐 걱정되시나요? 시뮬레이터를 통해 사전에 미리 대용량 트래픽을 테스트 해볼 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/traffic-image-sub1.png",
      },
      {
        title: "기술 지원",
        description:
          "콘서트, 마라톤 접수 등 전국에서 신청이 몰리는 이벤트의 경우, 기술팀의 지원을 받아 차질없는 진행을 도와드립니다. *별도 문의",
        artwork: "/affiliate/poc/images/demo-2-images/traffic-image-sub2.png",
      },
      {
        title: "개별 큐 서버",
        description:
          "최대 동시 접속 10만명까지 대용량 이벤트의 경우 별도의 Redis 큐 서버를 사용하실 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/traffic-image-sub3.png",
      },
    ],
  },
  "티켓/인벤토리": {
    main: {
      text: ["티켓팅", "인벤토리"],
      highlightColorStops: ["from-red-400", "via-pink-400", "to-purple-500"],
      artwork: "/affiliate/poc/images/demo-2-images/ticketing-image-main.png",
    },
    subs: [
      {
        title: "로직 블록과 함께 유연한 구현",
        description: "로직 블록과 함께 복잡한 인벤토리 로직 구현도 가능합니다.",
        artwork: "/affiliate/poc/images/demo-2-images/ticketing-image-sub1.png",
      },
      {
        title: "재입고 알림",
        description:
          "티켓 재고가 소진되었을 경우, 고객이 재입고 알림을 신청할 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/ticketing-image-sub2.png",
      },
      {
        title: "결제",
        description:
          "TossPayments나 Stripe를 통해 전세계에서 네이티브한 결제 경험을 제공해 보세요.",
        artwork: "/affiliate/poc/images/demo-2-images/ticketing-image-sub3.png",
      },
    ],
  },
  고객관리: {
    main: {
      text: ["똑똑한", "고객 관리"],
      highlightColorStops: [
        "from-orange-500",
        "via-yellow-400",
        "to-orange-200",
      ],
      artwork: "/affiliate/poc/images/demo-2-images/customer-image-main.png",
    },
    subs: [
      {
        title: "확정 문자 발송",
        description: "폼 신청이 접수된 고객에게 확정 문자를 보낼 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/customer-image-sub1.png",
      },
      {
        title: "문의 응대",
        description: "폼에 관한 고객들의 문의들을 확인하고 답할 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/customer-image-sub2.png",
      },
      {
        title: "AI 프로세싱",
        description:
          "고객의 응답을 기반으로 AI가 고객 분석및 데이터베이스를 자동으로 구성합니다.",
        artwork: "/affiliate/poc/images/demo-2-images/customer-image-sub3.png",
      },
    ],
  },
  개발자: {
    main: {
      text: ["바닥부터", "Headless"],
      highlightColorStops: ["from-green-700", "via-green-500", "to-green-300"],
      artwork: "/affiliate/poc/images/demo-2-images/developer-image-main.png",
    },
    subs: [
      {
        title: "철저한 개발자를 위한 설계",
        description:
          "Grida Forms는 바닥부터 개발자를 위한 Headless Forms로 설계 되었습니다. 무엇을 상상하든 구현 가능합니다.",
        artwork: "/affiliate/poc/images/demo-2-images/developer-image-sub1.png",
      },
      {
        title: "고객 DB 연동",
        description:
          "SSO를 통한 고객 통합 로그인 뿐만 아니라, SQL을 통한 직접적인 쿼리 및 Wrapper를 연동할 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/developer-image-sub2.png",
      },
      {
        title: "SDK",
        description:
          "이미 개발팀이 있으신가요? 마케터를 위한 폼 빌더로 사용하고. 앱에 유동적으로 연동하여 사용할수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/developer-image-sub3.png",
      },
    ],
  },
};
