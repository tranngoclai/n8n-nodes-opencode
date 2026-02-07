export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

export function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

export function getStringProp(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

export function getNumberProp(record: UnknownRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}

export function getBooleanProp(record: UnknownRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

export function getNestedRecord(record: UnknownRecord, key: string): UnknownRecord {
  return isRecord(record[key]) ? (record[key] as UnknownRecord) : {};
}

export function getNestedStringProp(record: UnknownRecord, key: string): string | undefined {
  return getStringProp(record, key) ?? getStringProp(getNestedRecord(record, key), key);
}

export function getNestedNumberProp(record: UnknownRecord, key: string): number | undefined {
  return getNumberProp(record, key) ?? getNumberProp(getNestedRecord(record, key), key);
}

export function getNestedBooleanProp(record: UnknownRecord, key: string): boolean | undefined {
  return getBooleanProp(record, key) ?? getBooleanProp(getNestedRecord(record, key), key);
}

export function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
