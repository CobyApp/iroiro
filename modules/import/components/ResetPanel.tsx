"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayKstYmd } from "@/lib/datetime";
import {
  bulkImportAllCards,
  exportProductsBackup,
  purgeAllProducts,
  type PurgePreview,
} from "@/modules/import/bulk-actions";

// 서버 검증과 동일해야 삭제가 통과한다.
const PURGE_CONFIRM_WORD = "전체삭제";

const KINDS = [
  { v: "", label: "전체" },
  { v: "random", label: "정규" },
  { v: "costume", label: "의상" },
  { v: "event", label: "이벤트" },
  { v: "birthday", label: "생탄제" },
];

type Ref = { id: number; name: string };

const selectClass =
  "h-9 rounded-md border border-border bg-background px-2 text-sm";

export function ResetPanel({
  preview,
  teams,
  members,
}: {
  preview: PurgePreview;
  teams: Ref[];
  members: Ref[];
}) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [teamId, setTeamId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [kind, setKind] = useState("");
  const [backupPending, startBackup] = useTransition();
  const [purgePending, startPurge] = useTransition();

  // 진행 상태 (전체 가져오기 배치 루프)
  const [importing, setImporting] = useState(false);
  const [prog, setProg] = useState({ created: 0, remaining: 0, failed: 0 });
  // 동기 재진입 가드(더블클릭·중복 루프로 인한 중복 생성 방지) + 취소 플래그.
  const runningRef = useRef(false);
  const cancelRef = useRef(false);

  const busy = backupPending || purgePending || importing;

  function handleBackup() {
    startBackup(async () => {
      try {
        const { json, productCount, photoCount } = await exportProductsBackup();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `iroiro-products-backup-${todayKstYmd()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(
          `백업 다운로드 완료 — 상품 ${productCount}개 · 사진 ${photoCount}장`,
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "백업에 실패했습니다.",
        );
      }
    });
  }

  // 전체 가져오기 — remaining이 0이 될 때까지 배치 반복(트래픽 분산 + 진행도 표시).
  // runningRef로 동기 재진입을 막아 동시 루프에 의한 중복 생성을 원천 차단한다.
  function handleBulkImport() {
    if (runningRef.current) return;
    runningRef.current = true;
    cancelRef.current = false;
    setImporting(true);
    setProg({ created: 0, remaining: 0, failed: 0 });
    void (async () => {
      let created = 0;
      let failed = 0;
      let guard = 0;
      let canceled = false;
      try {
        while (guard < 300) {
          if (cancelRef.current) {
            canceled = true;
            break;
          }
          guard += 1;
          const r = await bulkImportAllCards({
            teamId: teamId ? Number(teamId) : null,
            memberId: memberId ? Number(memberId) : null,
            kind: kind || undefined,
            batchSize: 8,
          });
          created += r.created;
          failed += r.failed.length;
          setProg({ created, remaining: r.remaining, failed });
          if (r.created === 0) break; // 더 이상 새 카드 없음(또는 전부 실패)
        }
        const note = `신규 ${created}건${failed ? ` · 실패 ${failed}` : ""}`;
        if (canceled) toast.info(`중단됨 — ${note}`);
        else toast.success(`가져오기 완료 — ${note}`);
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "가져오기에 실패했습니다.",
        );
      } finally {
        runningRef.current = false;
        setImporting(false);
      }
    })();
  }

  function handleCancelImport() {
    cancelRef.current = true;
  }

  function handlePurge() {
    if (confirmText !== PURGE_CONFIRM_WORD) return;
    startPurge(async () => {
      try {
        const r = await purgeAllProducts(PURGE_CONFIRM_WORD);
        toast.success(
          `삭제 완료 — 상품 ${r.products} · 사진 ${r.photos} · 장바구니 ${r.cartItems} · 위시 ${r.wishlists}`,
        );
        setConfirmText("");
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "삭제에 실패했습니다.",
        );
      }
    });
  }

  const total = prog.created + prog.remaining;
  const pct = total > 0 ? Math.round((prog.created / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* 현재 상태 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="상품" value={preview.products} />
        <Stat label="사진" value={preview.photos} />
        <Stat label="장바구니" value={preview.cartItems} />
        <Stat label="재고" value={preview.inventoryItems} />
      </div>

      {/* 1) 백업 */}
      <section className="rounded-md border border-border bg-card p-4 shadow-card">
        <h3 className="font-bold">1. 백업 다운로드</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          삭제 전, 현재 전체 상품·사진 데이터를 JSON 파일로 내려받아 보관하세요.
        </p>
        <Button
          className="mt-3"
          variant="outline"
          onClick={handleBackup}
          disabled={busy}
        >
          {backupPending ? "준비 중…" : "백업 JSON 다운로드"}
        </Button>
      </section>

      {/* 2) 전체 가져오기 */}
      <section className="rounded-md border border-border bg-card p-4 shadow-card">
        <h3 className="font-bold">2. 카드 일괄 가져오기</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          외부 카탈로그에서 아직 없는 카드를 <b>초안(draft)</b> 상품으로 전부
          등록해요. 가격·재고·매입정보는 0으로 두고 이후 상품 수정에서 채웁니다.
          이미 있는 카드는 건너뛰고, 여러 배치로 나눠 진행합니다.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">
            <span className="block font-medium">그룹</span>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              disabled={busy}
              className={selectClass}
            >
              <option value="">전체</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="block font-medium">멤버</span>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              disabled={busy}
              className={selectClass}
            >
              <option value="">전체</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="block font-medium">종류</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              disabled={busy}
              className={selectClass}
            >
              {KINDS.map((k) => (
                <option key={k.v} value={k.v}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          {importing ? (
            <Button variant="destructive" onClick={handleCancelImport}>
              중단
            </Button>
          ) : (
            <Button onClick={handleBulkImport} disabled={busy}>
              전체 가져오기
            </Button>
          )}
        </div>

        {/* 진행도 */}
        {(importing || prog.created > 0) && (
          <div className="mt-4 space-y-1.5">
            <div className="h-2.5 w-full overflow-hidden rounded-full border border-border bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${importing && total === 0 ? 6 : pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              신규 {prog.created}건 등록
              {total > 0 ? ` · 남은 ${prog.remaining}건 (${pct}%)` : ""}
              {prog.failed > 0 ? ` · 실패 ${prog.failed}` : ""}
              {importing ? " · 진행 중…" : " · 완료"}
            </p>
          </div>
        )}
      </section>

      {/* 3) 위험 구역 — 전체 삭제 */}
      <section className="rounded-md border border-destructive bg-destructive/5 p-4 shadow-card">
        <h3 className="font-bold text-destructive">3. 위험 · 전체 삭제</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          모든 상품과 그에 딸린 사진·장바구니·위시리스트를 삭제합니다. 되돌릴 수
          없어요. 먼저 위에서 백업을 받으세요.
          {(preview.orderItems > 0 ||
            preview.inventoryItems > 0 ||
            preview.collectionItems > 0) && (
            <>
              {" "}
              구매 결과는 지우지 않아요 — 주문 항목 {preview.orderItems}건 ·
              보유 {preview.inventoryItems}건 · 컬렉션 등록{" "}
              {preview.collectionItems}건은 <b>그대로 남습니다</b>. 다만 삭제된
              상품을 참조하는 고아 기록이 될 수 있어요(보유 항목은 자체 스냅샷이
              있어 컬렉션 표시는 유지됩니다).
            </>
          )}
        </p>
        <p className="mt-3 text-sm">
          확인을 위해 <b>{PURGE_CONFIRM_WORD}</b> 를 입력하세요.
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={PURGE_CONFIRM_WORD}
            className="w-40"
            disabled={busy}
          />
          <Button
            variant="destructive"
            onClick={handlePurge}
            disabled={busy || confirmText !== PURGE_CONFIRM_WORD}
          >
            {purgePending ? "삭제 중…" : "전체 삭제"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card p-3 text-center shadow-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
