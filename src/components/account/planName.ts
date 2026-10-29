/** "free" → "Yarda Free", "pro" → "Yarda Pro", "team" → "Yarda Team". */
export function planName(plan: string | null | undefined): string {
  const id = (plan ?? "free").trim().toLowerCase() || "free";
  if (id === "pro") return "Yarda Pro";
  if (id === "team") return "Yarda Team";
  if (id === "free") return "Yarda Free";
  return `Yarda ${id.charAt(0).toUpperCase()}${id.slice(1)}`;
}
