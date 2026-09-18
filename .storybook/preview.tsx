import type { Preview } from "@storybook/react-vite";
import "../app/globals.css";

// Storybook도 앱과 같은 단일 이로이로 라이트 캔버스를 사용한다.
// 테마 전환을 노출하지 않아 화면과 문서의 시각 계약이 갈라지지 않는다.
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      {children}
    </div>
  );
}

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    a11y: {
      element: "#storybook-root",
    },
  },
  decorators: [
    (Story) => (
      <Frame>
        <Story />
      </Frame>
    ),
  ],
};

export default preview;
