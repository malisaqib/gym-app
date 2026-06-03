export interface WeeklyCheckInLike {
  date: string;
}

export interface WeeklyStreakSummary {
  currentStreak: number;
  bestStreak: number;
  lastCheckInDate: string | null;
  reminderDue: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekStartKey(date: Date): string {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return toDateKey(copy);
}

function weekStartTime(key: string): number {
  return parseDateOnly(key)?.getTime() ?? 0;
}

export function calculateWeeklyStreak(
  checkIns: WeeklyCheckInLike[],
  now = new Date()
): WeeklyStreakSummary {
  const dated = checkIns
    .map((entry) => parseDateOnly(entry.date))
    .filter((date): date is Date => date !== null)
    .sort((a, b) => b.getTime() - a.getTime());

  if (dated.length === 0) {
    return { currentStreak: 0, bestStreak: 0, lastCheckInDate: null, reminderDue: true };
  }

  const uniqueWeeks = Array.from(new Set(dated.map(weekStartKey))).sort(
    (a, b) => weekStartTime(b) - weekStartTime(a)
  );

  let bestStreak = 1;
  let running = 1;

  for (let i = 1; i < uniqueWeeks.length; i += 1) {
    const prev = weekStartTime(uniqueWeeks[i - 1]);
    const current = weekStartTime(uniqueWeeks[i]);
    if (prev - current <= 8 * DAY_MS && prev - current >= 6 * DAY_MS) {
      running += 1;
      bestStreak = Math.max(bestStreak, running);
    } else {
      running = 1;
    }
  }

  const lastDate = dated[0];
  const daysSinceLast = Math.floor(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - lastDate.getTime()) / DAY_MS
  );

  let currentStreak = 1;
  for (let i = 1; i < uniqueWeeks.length; i += 1) {
    const prev = weekStartTime(uniqueWeeks[i - 1]);
    const current = weekStartTime(uniqueWeeks[i]);
    if (prev - current <= 8 * DAY_MS && prev - current >= 6 * DAY_MS) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  if (daysSinceLast > 13) currentStreak = 0;

  return {
    currentStreak,
    bestStreak,
    lastCheckInDate: toDateKey(lastDate),
    reminderDue: daysSinceLast >= 7,
  };
}
