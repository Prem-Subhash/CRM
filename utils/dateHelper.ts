/**
 * Calculates a future date by adding a specified number of working days.
 * Skips Saturdays and Sundays.
 * Ignores Public Holidays.
 *
 * @param daysToAdd The number of working days to add (e.g., 2)
 * @returns A string in YYYY-MM-DD format compatible with <input type="date">
 */
export function getFutureWorkingDate(daysToAdd: number): string {
    const date = new Date();
    
    let addedDays = 0;
    while (addedDays < daysToAdd) {
        date.setDate(date.getDate() + 1);
        
        const dayOfWeek = date.getDay();
        // 0 = Sunday, 6 = Saturday
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            addedDays++;
        }
    }

    // Format to YYYY-MM-DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/**
 * Formats a date-only string (e.g. "2026-10-18") for display.
 * Avoids timezone-induced day shifts by constructing a local Date object from YYYY-MM-DD components
 * instead of letting `new Date("YYYY-MM-DD")` parse as UTC midnight.
 *
 * @param dateStr Date-only string (e.g., "2026-10-18")
 * @param locale Optional locale (default: system/browser locale)
 * @param options Optional Intl.DateTimeFormatOptions
 * @returns Formatted date string (e.g., "10/18/2026")
 */
export function formatDateOnly(
  dateStr?: string | null,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateStr || typeof dateStr !== 'string' || dateStr.trim() === '') return '—'

  const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})(T.*)?$/
  const match = dateStr.trim().match(dateOnlyPattern)

  if (match) {
    const year = Number(match[1])
    const month = Number(match[2]) - 1
    const day = Number(match[3])
    const localDate = new Date(year, month, day)
    return localDate.toLocaleDateString(locale, options)
  }

  const fallbackDate = new Date(dateStr)
  if (isNaN(fallbackDate.getTime())) return dateStr
  return fallbackDate.toLocaleDateString(locale, options)
}

