"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, CircleSlash, Users } from "lucide-react";
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
import type { Team } from "../types";

type Props = {
  teams: Team[];
  value: number | null;
  onChange: (teamId: number | null) => void;
};

export function TeamCombobox({ teams, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = teams.find((team) => team.id === value);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Users className="h-4 w-4 shrink-0 opacity-60" />
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
                <span className="text-muted-foreground">그룹 선택</span>
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
              placeholder="그룹 검색..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                <div className="flex flex-col items-center gap-1 px-3 py-4">
                  <p className="text-sm text-muted-foreground">
                    {search
                      ? `‘${search}’와(과) 일치하는 그룹이 없어요`
                      : "등록된 그룹이 없어요"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    그룹 페이지에서 등록할 수 있어요
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
                  <CircleSlash className="h-4 w-4 shrink-0 opacity-50" />
                  <span className="flex-1 text-muted-foreground">
                    그룹 없음
                  </span>
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4",
                      value === null ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              </CommandGroup>
              {teams.length > 0 && (
                <CommandGroup heading="그룹">
                  {teams.map((team) => {
                    const jaJpan = team.nameI18n?.["ja-jpan"];
                    const jaHira = team.nameI18n?.["ja-hira"];
                    const en = team.nameI18n?.en;
                    const isSelected = value === team.id;
                    const secondary = [jaJpan, jaHira, en]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <CommandItem
                        key={team.id}
                        value={`${team.name} ${jaJpan ?? ""} ${jaHira ?? ""} ${en ?? ""}`}
                        onSelect={() => {
                          onChange(team.id);
                          setOpen(false);
                        }}
                        className="flex items-center gap-2"
                      >
                        <Users className="h-4 w-4 shrink-0 opacity-50" />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">
                            {team.name}
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
    </>
  );
}
