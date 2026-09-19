// NSE trading hours, 09:15–15:30 IST Mon–Fri.
// ponytail: no holiday calendar — weekday + clock only; add a holiday list if it matters.
const OPEN_MIN = 9 * 60 + 15;
const CLOSE_MIN = 15 * 60 + 30;

// IST regardless of the machine's timezone
function istNow(): { day: number; mins: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    day: days.indexOf(get("weekday")),
    mins: +get("hour") * 60 + +get("minute"),
  };
}

export function marketOpen(): boolean {
  const { day, mins } = istNow();
  return day >= 1 && day <= 5 && mins >= OPEN_MIN && mins <= CLOSE_MIN;
}

export function marketStatus(): { open: boolean; label: string } {
  const { day, mins } = istNow();
  if (day === 0 || day === 6) return { open: false, label: "Weekend" };
  if (mins < OPEN_MIN) return { open: false, label: "Pre-open" };
  if (mins > CLOSE_MIN) return { open: false, label: "Closed" };
  return { open: true, label: "Market open" };
}
