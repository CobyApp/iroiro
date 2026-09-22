import type { Metadata, Viewport } from "next";
import { Jua, Mochiy_Pop_One, Mochiy_Pop_P_One } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { DragScroll } from "@/components/DragScroll";

// 버블 키치 폰트 — 본문(Jua) + 제목(Mochiy Pop One) + 일본어 폴백(Mochiy Pop P One)
const jua = Jua({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-jua",
  display: "swap",
});

const mochiyDisplay = Mochiy_Pop_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-mochiy",
  display: "swap",
});

const mochiyP = Mochiy_Pop_P_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-mochiy-p",
  display: "swap",
});

export const metadata: Metadata = {
  title: "이로이로",
  description: "일본 아이돌 토레카·굿즈 카탈로그",
  applicationName: "이로이로",
  icons: {
    shortcut: [
      {
        url: "/favicon.ico",
        type: "image/x-icon",
      },
    ],
    icon: [
      {
        url: "/icon.png",
        sizes: "64x64",
        type: "image/png",
      },
      {
        url: "/brand/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "이로이로",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 핀치 줌은 접근성상 막지 않는다(maximumScale/userScalable 미설정).
  // iOS Safari의 입력창 포커스 자동 확대는 폼 컨트롤을 폰에서 16px(text-base)로
  // 렌더해 막는다 — components/ui/{input,select,textarea}.tsx 참고.
  themeColor: "#FFF8FC",
  // standalone(홈 화면 PWA)에서 하단 홈 인디케이터/제스처바 영역까지 그리되,
  // env(safe-area-inset-*)를 노출시켜 하단 탭바·플로팅 버튼이 그 위로 올라오게 한다.
  // iOS·Android(갤럭시 등) 공통. 미설정 시 env()가 0으로 평가돼 safe-area 패딩이 무력화됨.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${jua.variable} ${mochiyDisplay.variable} ${mochiyP.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
        {/* 데스크탑 마우스 드래그 가로 스크롤 — 상품 행·칩·표 공통. */}
        <DragScroll />
      </body>
    </html>
  );
}
