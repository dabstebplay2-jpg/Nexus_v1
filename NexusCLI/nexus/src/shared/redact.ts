export function redact(text: string) {
  return text
    .replace(/\b(sk-[a-zA-Z0-9_-]{8,}|gh[pousr]_[a-zA-Z0-9_]{10,})\b/g, "[REDACTED]")
    .replace(/(Bearer\s+)[^\s"']+/gi, "$1[REDACTED]")
    .replace(
      /((?:api[_-]?key|password|secret|access[_-]?token|authorization)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
      "$1[REDACTED]",
    )
}
export function safeJson(value: unknown) {
  return redact(JSON.stringify(value))
}
export function bound(text: string, limit = 6000) {
  const safe = redact(text)
  return safe.length <= limit
    ? { text: safe, truncated: false, totalChars: safe.length }
    : {
        text: `${safe.slice(0, Math.floor(limit / 2) - 20)}\n… [truncated] …\n${safe.slice(-Math.floor(limit / 2) + 20)}`,
        truncated: true,
        totalChars: safe.length,
      }
}
