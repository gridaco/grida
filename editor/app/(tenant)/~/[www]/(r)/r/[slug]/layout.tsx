import { Metadata } from "next";

// FIXME: REPLACE_STATIC
export const metadata: Metadata = {
  title: "Polestar 친구 초대 시승 이벤트",
  description: "Polestar 시승 하고 10만원 상당의 상품권을 받아보세요.",
  openGraph: {
    images:
      "https://www.polestar.com/dato-assets/11286/1644586145-home.jpg?auto=format&w=1200&h=630&fit=crop&q=35",
  },
};

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
