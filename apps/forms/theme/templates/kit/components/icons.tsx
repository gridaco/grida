import { SewingPinFilledIcon } from "@radix-ui/react-icons";

export function CalendarBoxIcon({
  month,
  day,
}: {
  month: string;
  day: string;
}) {
  return (
    <div className="rounded border w-10 h-10 uppercase overflow-hidden">
      <div id="month" className="flex justify-center items-center bg-primary">
        <span className="text-[0.5rem] text-primary-foreground">{month}</span>
      </div>
      <div id="day" className="flex justify-center items-center">
        <span className="font-semibold">{day}</span>
      </div>
    </div>
  );
}

export function LocationBoxIcon() {
  return (
    <div className="rounded border w-10 h-10 uppercase">
      <span className="w-full h-full flex items-center justify-center">
        <SewingPinFilledIcon />
      </span>
    </div>
  );
}
