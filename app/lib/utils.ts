export function formatJST(
  date: string | Date | null | undefined,
  format: "datetime" | "date" | "short" = "datetime"
): string {
  if (!date) return "未";
  const d = new Date(date);
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  };
  if (format === "datetime" || format === "short") {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }
  if (format === "short") {
    delete options.year;
  }
  return new Intl.DateTimeFormat("ja-JP", options).format(d);
}
