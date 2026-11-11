export function isoTimestamp(date = new Date()) {
  return date.toISOString();
}

export function isoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function daysAgo(dayCount, from = new Date()) {
  const result = new Date(from);
  result.setDate(result.getDate() - dayCount);
  return result;
}
