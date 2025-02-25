import { format } from "date-fns";
import { cn } from "@/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "@radix-ui/react-icons";
import timezones from "timezones-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function TZPicker({
  defaultValue,
  value,
  onValueChange,
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (tzCode: string) => void;
}) {
  return (
    <Select
      defaultValue={defaultValue}
      value={value}
      onValueChange={onValueChange}
    >
      <SelectTrigger className="max-w-40 text-xs">
        <SelectValue placeholder="Choose Time Zone" />
      </SelectTrigger>
      <SelectContent>
        {timezones.map((timezone) => (
          <SelectItem key={timezone.tzCode} value={timezone.tzCode}>
            {timezone.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DatePicker({
  placeholder,
  date,
  onValueChange,
}: {
  placeholder?: string;
  date: Date | undefined;
  onValueChange?: (date: Date | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onValueChange}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export function TimePicker({
  value,
  onValueChange,
}: {
  value?: string;
  onValueChange?: (time: string) => void;
}) {
  return (
    <Input
      type="time"
      value={value}
      onChange={(e) => {
        onValueChange?.(e.target.value);
      }}
    />
  );
}
