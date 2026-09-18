"use client";

import * as React from "react";
import { CalendarIcon, XIcon } from "lucide-react";
import { format, parse, isValid } from "date-fns";
import { ko } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
};

const ISO_FORMAT = "yyyy-MM-dd";
const DISPLAY_FORMAT = "yyyy-MM-dd (EEE)";

export function DatePicker({
  value,
  onChange,
  placeholder = "날짜 선택",
  disabled,
  id,
  className,
}: Props) {
  const [open, setOpen] = React.useState(false);

  const selectedDate = React.useMemo(() => {
    if (!value) return undefined;
    const parsed = parse(value, ISO_FORMAT, new Date());
    return isValid(parsed) ? parsed : undefined;
  }, [value]);

  function handleSelect(date: Date | undefined) {
    if (!date) {
      onChange(null);
    } else {
      onChange(format(date, ISO_FORMAT));
    }
    setOpen(false);
  }

  function handleClear(event: React.MouseEvent) {
    event.stopPropagation();
    onChange(null);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selectedDate && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 opacity-60" />
            {selectedDate
              ? format(selectedDate, DISPLAY_FORMAT, { locale: ko })
              : placeholder}
          </span>
          {selectedDate && !disabled ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="날짜 지우기"
              onClick={handleClear}
              onPointerDown={(event) => event.stopPropagation()}
              className="rounded-sm p-0.5 opacity-60 hover:bg-muted hover:opacity-100"
            >
              <XIcon className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          locale={ko}
          captionLayout="dropdown"
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
