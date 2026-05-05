// ============================================================
// FAJO ERP - CSV Export Helper
// ============================================================
// Generates RFC-4180-compliant CSV files in the browser.
// Used by Accounts Manager exports (Financials + Expenses) so
// the data can be opened in Excel / Google Sheets / Tally
// without further cleanup.
//
// Conventions:
//   - Currency values are emitted as raw numbers (no Rs. or
//     thousand-separators) so spreadsheets can SUM them.
//   - Timestamps are emitted in ISO-8601 form via
//     Date.toISOString() so they sort lexicographically and
//     can be parsed deterministically.
//   - Any cell containing a comma, double-quote, newline, or
//     carriage-return is wrapped in double quotes; embedded
//     double-quotes are doubled per the RFC.

export type CsvCell = string | number | boolean | null | undefined | Date

/** Quote a single cell per RFC 4180. */
function escapeCell(cell: CsvCell): string {
    if (cell === null || cell === undefined) return ''
    let value: string
    if (cell instanceof Date) {
        value = cell.toISOString()
    } else if (typeof cell === 'number') {
        // Avoid scientific notation for large amounts; keep numerics raw
        // so Excel sees them as numbers.
        value = Number.isFinite(cell) ? String(cell) : ''
    } else if (typeof cell === 'boolean') {
        value = cell ? 'true' : 'false'
    } else {
        value = String(cell)
    }

    if (/[",\n\r]/.test(value)) {
        return '"' + value.replace(/"/g, '""') + '"'
    }
    return value
}

/** Serialise rows into a CSV string. The first row should be the header. */
export function rowsToCsv(rows: CsvCell[][]): string {
    return rows.map(row => row.map(escapeCell).join(',')).join('\r\n')
}

/**
 * Trigger a browser download for the given CSV rows.
 *
 * @param filename  Desired file name (will be suffixed with .csv if missing)
 * @param rows      2-D array of cells. First row should be the header.
 */
export function exportToCSV(filename: string, rows: CsvCell[][]): void {
    if (typeof window === 'undefined') return
    if (!rows || rows.length === 0) return

    const csv = rowsToCsv(rows)
    // Prepend BOM so Excel detects UTF-8 (currency symbols, regional names).
    const bom = '﻿'
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // Free the blob after the click has been fully dispatched.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}
