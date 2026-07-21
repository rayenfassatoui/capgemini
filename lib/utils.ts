import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const UTC_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
})

const UTC_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
})

function getDatePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
) {
  return parts.find((part) => part.type === type)?.value ?? ""
}

export function formatUtcDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"

  const parts = UTC_DATE_TIME_FORMATTER.formatToParts(date)
  const month = getDatePart(parts, "month")
  const day = getDatePart(parts, "day")
  const year = getDatePart(parts, "year")
  const hour = getDatePart(parts, "hour")
  const minute = getDatePart(parts, "minute")
  const dayPeriod = getDatePart(parts, "dayPeriod")

  return `${month} ${day}, ${year}, ${hour}:${minute} ${dayPeriod} UTC`
}

export function formatUtcDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"

  const parts = UTC_DATE_FORMATTER.formatToParts(date)
  const month = getDatePart(parts, "month")
  const day = getDatePart(parts, "day")
  const year = getDatePart(parts, "year")

  return `${month} ${day}, ${year}`
}
