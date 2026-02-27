/**
 * RFC 4180 CSV parser. Handles quoted fields with commas and embedded quotes.
 * Skips empty rows. Throws if requiredColumns are missing from header.
 */
export function parseCsv(text: string, requiredColumns?: string[]): Record<string, string>[] {
  const lines = splitCsvLines(text.trim())
  if (lines.length === 0) return []

  const headers = parseCsvRow(lines[0]).map(h => h.trim().toLowerCase())

  if (requiredColumns) {
    for (const col of requiredColumns) {
      if (!headers.includes(col.toLowerCase())) {
        throw new Error(`Missing required column: ${col}`)
      }
    }
  }

  const results: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseCsvRow(line)
    // skip entirely empty rows
    if (values.every(v => v === '')) continue
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] ?? '' })
    results.push(row)
  }

  return results
}

/**
 * Wrap value in quotes if it contains a comma, double-quote, or newline.
 * Escape embedded double-quotes by doubling them.
 */
export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** Split raw CSV text into lines, respecting quoted fields that span lines.
 *  Passes characters verbatim so parseCsvRow can do full RFC 4180 parsing. */
function splitCsvLines(text: string): string[] {
  const lines: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        // Escaped quote — pass both chars through verbatim for parseCsvRow
        current += '""'
        i++
      } else {
        inQuotes = !inQuotes
        current += ch
      }
    } else if ((ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) && !inQuotes) {
      if (ch === '\r') i++
      lines.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.length > 0 || lines.length > 0) lines.push(current)
  return lines
}

/** Parse a single CSV row respecting RFC 4180 quoting. */
function parseCsvRow(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        field += '"'
        i += 2
        continue
      }
      inQuotes = !inQuotes
      i++
    } else if (ch === ',' && !inQuotes) {
      fields.push(field)
      field = ''
      i++
    } else {
      field += ch
      i++
    }
  }
  fields.push(field)
  return fields
}
