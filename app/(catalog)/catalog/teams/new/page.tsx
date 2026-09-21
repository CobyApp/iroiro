import { Toaster } from "@/components/ui/sonner";
import { TeamForm } from "@/modules/teams/components/TeamForm";

export default function TeamNewPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Toaster />
      <h2 className="text-2xl font-bold">신규 그룹 등록</h2>
      <TeamForm mode="new" />
    </div>
  );
}
