// Storage stays UTC (ISO 8601). Output shows local time, so a 9:30 PM write
// doesn't read as the next day.
export const DISPLAY_TZ = "America/Detroit";

const parts = (iso: string) =>
	Object.fromEntries(
		new Intl.DateTimeFormat("en-US", {
			timeZone: DISPLAY_TZ,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
			timeZoneName: "short",
		})
			.formatToParts(new Date(iso))
			.map((p) => [p.type, p.value]),
	);

/** 2026-11-23 */
export function localDate(iso: string): string {
	const p = parts(iso);
	return `${p.year}-${p.month}-${p.day}`;
}

/** 2026-11-23 21:30 EST */
export function localDateTime(iso: string): string {
	const p = parts(iso);
	return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ${p.timeZoneName}`;
}
