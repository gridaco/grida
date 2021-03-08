import { parse, format } from "date-fns";

export default function DateFormatter({ dateString }) {
  const date = parse(dateString);
  return <time dateTime={dateString}>{format(date, "LLLL	d, yyyy")}</time>;
}
