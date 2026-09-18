"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, UserCircle, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { MemberWithTeams } from "../types";

type Props = {
  members: MemberWithTeams[];
  teamId: number | null;
  value: number | null;
  onChange: (memberId: number | null) => void;
};

export function MemberCombobox({ members, teamId, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered =
    teamId !== null
      ? members.filter((member) => member.teamIds.includes(teamId))
      : [];
  const selected = filtered.find((member) => member.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={teamId === null}
          className="w-full justify-between font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <UserCircle className="h-4 w-4 shrink-0 opacity-60" />
            {selected ? (
              <span className="flex min-w-0 items-baseline gap-2 truncate">
                <span className="truncate">{selected.name}</span>
                {selected.nameI18n?.["ja-jpan"] && (
                  <span className="truncate text-xs text-muted-foreground">
                    {selected.nameI18n["ja-jpan"]}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {teamId !== null
                  ? "멤버 선택 (선택사항)"
                  : "그룹을 먼저 선택하세요"}
              </span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder="멤버 검색..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              <div className="flex flex-col items-center gap-1 px-3 py-4">
                <p className="text-sm text-muted-foreground">
                  {search
                    ? `‘${search}’와(과) 일치하는 멤버가 없어요`
                    : "이 그룹에 등록된 멤버가 없어요"}
                </p>
                <p className="text-xs text-muted-foreground">
                  멤버 페이지에서 등록할 수 있어요
                </p>
              </div>
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="flex items-center gap-2"
              >
                <UserX className="h-4 w-4 shrink-0 opacity-50" />
                <span className="flex-1 text-muted-foreground">
                  멤버 없음 (그룹 굿즈)
                </span>
                <Check
                  className={cn(
                    "ml-auto h-4 w-4",
                    value === null ? "opacity-100" : "opacity-0",
                  )}
                />
              </CommandItem>
            </CommandGroup>
            {filtered.length > 0 && (
              <CommandGroup heading="멤버">
                {filtered.map((member) => {
                  const jaJpan = member.nameI18n?.["ja-jpan"];
                  const jaHira = member.nameI18n?.["ja-hira"];
                  const en = member.nameI18n?.en;
                  const isSelected = value === member.id;
                  const secondary = [jaJpan, jaHira, en]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <CommandItem
                      key={member.id}
                      value={`${member.name} ${jaJpan ?? ""} ${jaHira ?? ""} ${en ?? ""}`}
                      onSelect={() => {
                        onChange(member.id);
                        setOpen(false);
                      }}
                      className="flex items-center gap-2"
                    >
                      <UserCircle className="h-4 w-4 shrink-0 opacity-50" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">
                          {member.name}
                        </span>
                        {secondary && (
                          <span className="truncate text-xs text-muted-foreground">
                            {secondary}
                          </span>
                        )}
                      </div>
                      <Check
                        className={cn(
                          "ml-auto h-4 w-4",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
