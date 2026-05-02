function escapeCsv(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function toCsv(rows, headers) {
  const lines = [];
  lines.push(headers.map(escapeCsv).join(","));

  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsv(row[header] ?? "")).join(","));
  }

  return `${lines.join("\n")}\n`;
}

module.exports = {
  toCsv,
};
