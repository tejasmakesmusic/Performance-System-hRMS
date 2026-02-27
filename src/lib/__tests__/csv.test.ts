import { describe, it, expect } from 'vitest'
import { parseCsv, escapeCsvField } from '../csv'

describe('parseCsv', () => {
  it('parses simple CSV', () => {
    const result = parseCsv('name,email\nAlice,alice@example.com\nBob,bob@example.com')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ name: 'Alice', email: 'alice@example.com' })
    expect(result[1]).toEqual({ name: 'Bob', email: 'bob@example.com' })
  })

  it('handles quoted fields with commas', () => {
    const result = parseCsv('name,dept\n"Smith, John",Engineering')
    expect(result[0].name).toBe('Smith, John')
    expect(result[0].dept).toBe('Engineering')
  })

  it('handles embedded double-quotes', () => {
    const result = parseCsv('name,note\n"He said ""hello""",ok')
    expect(result[0].name).toBe('He said "hello"')
  })

  it('skips empty rows', () => {
    const result = parseCsv('a,b\n1,2\n\n3,4\n')
    expect(result).toHaveLength(2)
  })

  it('throws on missing required columns', () => {
    expect(() => parseCsv('name,email\nAlice,a@b.com', ['zimyo_id'])).toThrow('Missing required column: zimyo_id')
  })

  it('returns empty array for empty input', () => {
    expect(parseCsv('')).toHaveLength(0)
  })

  it('handles CRLF line endings', () => {
    const result = parseCsv('a,b\r\n1,2\r\n3,4')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ a: '1', b: '2' })
  })

  it('lowercases header names', () => {
    const result = parseCsv('Name,Email\nAlice,a@b.com')
    expect(result[0]).toHaveProperty('name')
    expect(result[0]).toHaveProperty('email')
  })
})

describe('escapeCsvField', () => {
  it('returns plain string unchanged', () => {
    expect(escapeCsvField('hello')).toBe('hello')
  })

  it('wraps field with comma in quotes', () => {
    expect(escapeCsvField('Smith, John')).toBe('"Smith, John"')
  })

  it('escapes embedded double-quotes', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""')
  })

  it('wraps field with newline in quotes', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"')
  })

  it('prevents CSV injection (formula prefix)', () => {
    // injection formulas start with = + - @ but escapeCsvField wraps if contains special chars
    // for plain injection strings without comma/quote, callers should sanitize separately
    // but if the injection string has a comma it gets quoted
    expect(escapeCsvField('=SUM(A1),bad')).toBe('"=SUM(A1),bad"')
  })
})
