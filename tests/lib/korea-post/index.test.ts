import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getTrackingStatus,
  issueTracking,
  TRACKING_STATE_LABEL,
} from "@/lib/korea-post";
import { mockPostTrackingCode, trackingPageUrl } from "@/lib/korea-post/format";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lib/korea-post", () => {
  it("issueTracking 은 EB+9자리+KR 등기 형식을 발급한다", () => {
    const { trackingCode } = issueTracking({ seed: 12345 });
    expect(trackingCode).toMatch(/^EB\d{9}KR$/);
  });

  it("mockPostTrackingCode 는 같은 시드에 같은 코드(멱등)", () => {
    expect(mockPostTrackingCode(999)).toBe(mockPostTrackingCode(999));
  });

  it("trackingPageUrl 은 등기번호를 담은 조회 링크를 만든다", () => {
    expect(trackingPageUrl("EB000000001KR")).toContain("EB000000001KR");
  });

  describe("getTrackingStatus (키 미설정 = 더미)", () => {
    it("실 HTTP 호출 없이 더미 상태를 돌려준다", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const status = await getTrackingStatus("EB123456789KR");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(status.isMock).toBe(true);
      expect(status.trackingCode).toBe("EB123456789KR");
      expect(status.events.length).toBeGreaterThan(0);
      expect(status.stateLabel).toBe(TRACKING_STATE_LABEL[status.state]);
    });

    it("같은 코드는 같은 상태(결정적)", async () => {
      const a = await getTrackingStatus("EB111111111KR");
      const b = await getTrackingStatus("EB111111111KR");
      expect(a.state).toBe(b.state);
    });
  });
});
