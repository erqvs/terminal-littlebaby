import dayjs from 'dayjs';

export function calculateCurrentWeek(
  startDate: string | Date,
  totalWeeks: number,
  targetDate: string | Date = new Date()
): number {
  const diffDays = dayjs(targetDate).startOf('day').diff(dayjs(startDate).startOf('day'), 'day');
  const rawWeek = Math.floor(diffDays / 7) + 1;

  return Math.max(1, Math.min(rawWeek, totalWeeks));
}
