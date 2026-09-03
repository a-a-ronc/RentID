export function money(value: number | null | undefined, opts?: { cents?: boolean }) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts?.cents ? 2 : 0,
    maximumFractionDigits: opts?.cents ? 2 : 0,
  });
}

export function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fullDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function monthLabel(date = new Date()) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function initials(name: string | null | undefined) {
  if (!name) return "··";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function greeting(name?: string | null) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = name?.split(" ")[0];
  return first ? `${part}, ${first}` : part;
}

export function daysUntil(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 86_400_000);
}
