export type OptimisticLogKind = "text" | "search";
export type OptimisticLogStatus = "logging" | "failed";

export interface OptimisticLog {
  tempId: string;
  text: string;
  kind: OptimisticLogKind;
  status: OptimisticLogStatus;
  createdAt: number;
  optionId?: string;
  error?: string;
}

function normalizeOptimisticText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function createOptimisticLog(input: {
  kind: OptimisticLogKind;
  text: string;
  optionId?: string;
  tempId?: string;
  now?: number;
}): OptimisticLog {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    tempId: input.tempId ?? randomId,
    text: input.text,
    kind: input.kind,
    status: "logging",
    createdAt: input.now ?? Date.now(),
    ...(input.optionId ? { optionId: input.optionId } : {}),
  };
}

export function optimisticLogKey(log: Pick<OptimisticLog, "kind" | "text" | "optionId">): string {
  if (log.kind === "search" && log.optionId) return `search:${log.optionId}`;
  return `${log.kind}:${normalizeOptimisticText(log.text)}`;
}

export function reserveOptimisticLog(activeKeys: Set<string>, key: string): boolean {
  if (activeKeys.has(key)) return false;
  activeKeys.add(key);
  return true;
}

export function releaseOptimisticLog(activeKeys: Set<string>, key: string): void {
  activeKeys.delete(key);
}

export function failOptimisticLog(logs: OptimisticLog[], tempId: string, error: string): OptimisticLog[] {
  return logs.map((log) => (log.tempId === tempId ? { ...log, status: "failed", error } : log));
}

export function removeOptimisticLog(logs: OptimisticLog[], tempId: string): OptimisticLog[] {
  return logs.filter((log) => log.tempId !== tempId);
}
