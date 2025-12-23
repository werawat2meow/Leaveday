import {
  countBusinessDays,
  HalfSession,
  normalizeSession,
} from "@/lib/leave-utils";

export type YearSegment = {
  year: number;
  start: Date;
  end: Date;
  includesOriginalStart: boolean;
};

function startOfYear(y: number) {
  return new Date(`${y}-01-01T00:00:00.000Z`);
}

function endOfYear(y: number) {
  // inclusive end (end of day) isn't needed; we use date iteration in countBusinessDays.
  return new Date(`${y}-12-31T00:00:00.000Z`);
}

export function splitRangeByYear(start: Date, end: Date): YearSegment[] {
  if (end < start) return [];

  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  const segments: YearSegment[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const segStart = y === startYear ? start : startOfYear(y);
    const segEnd = y === endYear ? end : endOfYear(y);
    segments.push({
      year: y,
      start: segStart,
      end: segEnd,
      includesOriginalStart: y === startYear,
    });
  }
  return segments;
}

export type YearDays = Record<number, number>;

export function countBusinessDaysByYear(params: {
  start: Date;
  end: Date;
  sessionLabel?: string;
  holidaysByYear: Record<number, Set<string>>;
  weeklyHoliday?: string;
}): YearDays {
  const { start, end, sessionLabel, holidaysByYear, weeklyHoliday } = params;

  const session = normalizeSession(sessionLabel);
  const segments = splitRangeByYear(start, end);
  const result: YearDays = {};

  for (const seg of segments) {
    const holidays = holidaysByYear[seg.year] ?? new Set<string>();

    // Session adjustment in this codebase only applies to the segment containing the original start date.
    // This preserves the original behavior of countBusinessDays when a range spans multiple days.
    const segSession: HalfSession = seg.includesOriginalStart
      ? session
      : "FULL";

    result[seg.year] = countBusinessDays(
      seg.start,
      seg.end,
      segSession,
      holidays,
      weeklyHoliday
    );
  }

  return result;
}
