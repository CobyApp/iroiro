"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MEET_LOCATION_MAX, type MeetLocation } from "../types";
import { hasKakaoMapKey, loadKakaoMaps } from "../lib/kakao-loader";

type Props = {
  value: MeetLocation[];
  onChange: (next: MeetLocation[]) => void;
};

type SearchHit = { label: string; address: string; lat: number; lng: number };

// 직거래 만날 장소 선택기 — 카카오맵 키워드 검색 또는 지도 클릭으로 최대 3곳을 고른다.
// 각 장소는 라벨(예: "서면역 1번 출구")·주소·좌표를 갖는다. 키가 없으면 안내만 표시.
export function MeetLocationPicker({ value, onChange }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const kakaoRef = useRef<any>(null);
  const mapObjRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  // 지도 클릭 핸들러는 최초 1회 등록되므로, 최신 add 함수를 ref 로 참조해 스테일 클로저를 피한다.
  const addRef = useRef<(hit: SearchHit) => void>(() => {});
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(!hasKakaoMapKey());
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const atMax = value.length >= MEET_LOCATION_MAX;

  // 선택된 장소들로 지도 마커를 다시 그린다.
  const renderMarkers = useCallback((locations: MeetLocation[]) => {
    const kakao = kakaoRef.current;
    const map = mapObjRef.current;
    if (!kakao || !map) return;
    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];
    const bounds = new kakao.maps.LatLngBounds();
    for (const loc of locations) {
      const pos = new kakao.maps.LatLng(loc.lat, loc.lng);
      const marker = new kakao.maps.Marker({ position: pos, map });
      markersRef.current.push(marker);
      bounds.extend(pos);
    }
    if (locations.length > 0) map.setBounds(bounds);
  }, []);

  useEffect(() => {
    if (failed) return;
    let alive = true;
    loadKakaoMaps()
      .then((kakao) => {
        if (!alive || !mapRef.current) return;
        kakaoRef.current = kakao;
        const center = value[0]
          ? new kakao.maps.LatLng(value[0].lat, value[0].lng)
          : new kakao.maps.LatLng(37.5665, 126.978); // 서울 시청 기본
        const map = new kakao.maps.Map(mapRef.current, { center, level: 5 });
        mapObjRef.current = map;
        // 지도 클릭 → 좌표를 주소로 변환해 추가.
        kakao.maps.event.addListener(map, "click", (e: any) => {
          const latlng = e.latLng;
          const geocoder = new kakao.maps.services.Geocoder();
          geocoder.coord2Address(latlng.getLng(), latlng.getLat(), (res: any[], status: string) => {
            const addr =
              status === kakao.maps.services.Status.OK && res[0]
                ? res[0].road_address?.address_name || res[0].address?.address_name || ""
                : "";
            addRef.current({ label: addr || "선택한 위치", address: addr, lat: latlng.getLat(), lng: latlng.getLng() });
          });
        });
        setReady(true);
        renderMarkers(value);
      })
      .catch(() => setFailed(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  useEffect(() => {
    if (ready) renderMarkers(value);
  }, [value, ready, renderMarkers]);

  function addLocation(hit: SearchHit) {
    if (value.length >= MEET_LOCATION_MAX) return;
    // 같은 좌표 중복 방지.
    if (value.some((v) => Math.abs(v.lat - hit.lat) < 1e-6 && Math.abs(v.lng - hit.lng) < 1e-6)) return;
    onChange([...value, { label: hit.label.slice(0, 30), address: hit.address, lat: hit.lat, lng: hit.lng }]);
  }
  // 지도 클릭 핸들러(최초 1회 등록)가 항상 최신 value/onChange 를 쓰도록 렌더 후 ref 갱신.
  useEffect(() => {
    addRef.current = addLocation;
  });

  function search() {
    const kakao = kakaoRef.current;
    if (!kakao || !q.trim()) return;
    setSearching(true);
    const places = new kakao.maps.services.Places();
    places.keywordSearch(q.trim(), (data: any[], status: string) => {
      setSearching(false);
      if (status !== kakao.maps.services.Status.OK) {
        setHits([]);
        return;
      }
      setHits(
        data.slice(0, 8).map((d) => ({
          label: d.place_name as string,
          address: (d.road_address_name || d.address_name || "") as string,
          lat: Number(d.y),
          lng: Number(d.x),
        })),
      );
      if (data[0]) {
        mapObjRef.current?.panTo(new kakao.maps.LatLng(Number(data[0].y), Number(data[0].x)));
      }
    });
  }

  function updateLabel(index: number, label: string) {
    onChange(value.map((v, i) => (i === index ? { ...v, label: label.slice(0, 30) } : v)));
  }
  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  if (failed) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        지도를 불러올 수 없어요. 카카오맵 키(NEXT_PUBLIC_KAKAO_MAP_JS_KEY)가 설정되면 만날 장소를 지도로 고를 수 있어요.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
        className="flex gap-2"
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="장소·역·건물 검색 (예: 서면역)"
          inputMode="search"
          disabled={!ready || atMax}
        />
        <Button type="submit" size="sm" disabled={!ready || atMax || searching}>
          <Search className="h-3.5 w-3.5" />
        </Button>
      </form>

      {hits.length > 0 && !atMax && (
        <ul className="max-h-40 overflow-y-auto rounded-md border border-border bg-card text-sm">
          {hits.map((h, i) => (
            <li key={`${h.lat}-${h.lng}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  addLocation(h);
                  setHits([]);
                  setQ("");
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{h.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{h.address}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div
        ref={mapRef}
        className="h-56 w-full overflow-hidden rounded-md border border-border bg-muted"
        aria-label="만날 장소 지도"
      />
      <p className="text-xs text-muted-foreground">
        검색 결과를 선택하거나 지도를 눌러 장소를 추가하세요. 최대 {MEET_LOCATION_MAX}곳.
      </p>

      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((loc, i) => (
            <li key={`${loc.lat}-${loc.lng}-${i}`} className="rounded-md border border-border bg-card p-2">
              <div className="flex items-center gap-2">
                <Input
                  value={loc.label}
                  onChange={(e) => updateLabel(i, e.target.value)}
                  placeholder="장소 이름 (예: 서면역 1번 출구)"
                  className="h-8 flex-1 text-sm"
                  maxLength={30}
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label="장소 삭제"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {loc.address && <p className="mt-1 pl-1 text-xs text-muted-foreground">{loc.address}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
