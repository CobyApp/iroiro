"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { MeetLocation } from "../types";
import { hasKakaoMapKey, loadKakaoMaps } from "../lib/kakao-loader";

type Props = { locations: MeetLocation[] };

// 매물 상세 — 직거래 만날 장소를 지도 + 목록으로 보여준다(읽기 전용). 키가 없으면 목록만.
export function MeetLocationMap({ locations }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(!hasKakaoMapKey());

  useEffect(() => {
    if (failed || locations.length === 0) return;
    let alive = true;
    loadKakaoMaps()
      .then((kakao) => {
        if (!alive || !mapRef.current) return;
        const first = new kakao.maps.LatLng(locations[0].lat, locations[0].lng);
        const map = new kakao.maps.Map(mapRef.current, { center: first, level: 5 });
        const bounds = new kakao.maps.LatLngBounds();
        for (const loc of locations) {
          const pos = new kakao.maps.LatLng(loc.lat, loc.lng);
          const marker = new kakao.maps.Marker({ position: pos, map });
          const iw = new kakao.maps.InfoWindow({
            content: `<div style="padding:4px 8px;font-size:12px;white-space:nowrap;">${escapeHtml(loc.label)}</div>`,
          });
          kakao.maps.event.addListener(marker, "click", () => iw.open(map, marker));
          bounds.extend(pos);
        }
        map.setBounds(bounds);
      })
      .catch(() => setFailed(true));
    return () => {
      alive = false;
    };
  }, [failed, locations]);

  if (locations.length === 0) return null;

  return (
    <div className="space-y-2">
      {!failed && (
        <div ref={mapRef} className="h-52 w-full overflow-hidden rounded-md border border-border bg-muted" aria-label="만날 장소 지도" />
      )}
      <ul className="space-y-1">
        {locations.map((loc, i) => (
          <li key={`${loc.lat}-${loc.lng}-${i}`} className="flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block font-medium text-foreground">{loc.label}</span>
              {loc.address && <span className="block text-xs text-muted-foreground">{loc.address}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
