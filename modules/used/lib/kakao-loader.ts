"use client";

// 카카오맵 JS SDK 지연 로더 — 클라이언트 전용. JavaScript 키는 서버가 런타임 env(SSM)에서 읽어
// 컴포넌트 prop 으로 내려준다(빌드 인라인 아님, 환경별 키). autoload=false 로 받아 kakao.maps.load
// 콜백에서 준비 완료를 보장한다. 한 번만 주입(중복 방지). services 라이브러리로 검색·좌표→주소 변환.

/* eslint-disable @typescript-eslint/no-explicit-any */
let loadPromise: Promise<any> | null = null;

export function loadKakaoMaps(key: string): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no-window"));
  }
  if (!key) return Promise.reject(new Error("no-key"));
  const w = window as any;
  if (w.kakao?.maps?.services) return Promise.resolve(w.kakao);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("kakao-maps-sdk");
    const onReady = () => w.kakao.maps.load(() => resolve(w.kakao));
    if (existing) {
      if (w.kakao?.maps) onReady();
      else existing.addEventListener("load", onReady, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "kakao-maps-sdk";
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&libraries=services&autoload=false`;
    script.onload = onReady;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("kakao-load-failed"));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}
