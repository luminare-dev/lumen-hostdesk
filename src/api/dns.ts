// Checks for DNS records before they go to PUT /dns/{id}. Values use zone-file notation, as
// KeyHelp's own DNS editor and its default zone do ("10 mail" for MX). The checks catch typing
// mistakes; the server still has the last word.

import type { DnsRecord, DnsSoa } from './types';

/** The record types the editor offers. Other types the server returns are kept as they are. */
export const EDITABLE_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'] as const;
export type EditableType = (typeof EDITABLE_TYPES)[number];

export type DnsIssue =
  | 'host'
  | 'ttl'
  | 'type'
  | 'ipv4'
  | 'ipv6'
  | 'target'
  | 'mx'
  | 'txt'
  | 'srv'
  | 'srvHost'
  | 'caa'
  | 'cnameApex'
  | 'cnameConflict';

export type SoaIssue = 'soaNumber' | 'soaName';

export const TTL_MIN = 1;
export const TTL_MAX = 2_147_483_647;
export const DEFAULT_TTL = 86_400;

const LABEL = '[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?';
/** A name relative to the zone or absolute with a trailing dot: "www", "mail.example.net.". */
const NAME = new RegExp(`^(?=.{1,254}$)${LABEL}(?:\\.${LABEL})*\\.?$`, 'i');
/** A record's host: "@", "*", "www", "*.dev", "_dmarc", "default._domainkey". */
const HOST = new RegExp(`^(?:@|\\*|(?:\\*\\.)?${LABEL}(?:\\.${LABEL})*\\.?)$`, 'i');
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const CAA_TAGS = ['issue', 'issuewild', 'iodef', 'issuemail', 'issuevmc', 'contactemail', 'contactphone'];

const isEditable = (type: string): type is EditableType => (EDITABLE_TYPES as readonly string[]).includes(type);
const u16 = (text: string) => /^\d{1,5}$/.test(text) && Number(text) <= 65_535;

export function isIpv4(value: string): boolean {
  return IPV4.test(value);
}

export function isIpv6(value: string): boolean {
  if (!/^[0-9a-f:.]+$/i.test(value) || value.length > 45) return false;
  const halves = value.split('::');
  if (halves.length > 2) return false;
  const groups = halves.flatMap((half) => (half === '' ? [] : half.split(':')));
  let count = groups.length;
  const last = groups[groups.length - 1];
  if (last !== undefined && last.includes('.')) {
    // An embedded IPv4 address (::ffff:192.0.2.1) counts as two groups and must come last.
    if (!IPV4.test(last)) return false;
    groups.pop();
    count += 1;
  }
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return false;
  return halves.length === 2 ? count <= 7 : count === 8;
}

/** A host name or "." (no service: null MX, unused SRV). */
const isTarget = (value: string) => value === '.' || value === '@' || NAME.test(value);

export function isValidTtl(ttl: number): boolean {
  return Number.isInteger(ttl) && ttl >= TTL_MIN && ttl <= TTL_MAX;
}

/** Checks one record on its own; returns the first problem or null. */
export function validateRecord(record: DnsRecord): DnsIssue | null {
  const type = record.type.trim().toUpperCase();
  const host = record.host.trim();
  const value = record.value.trim();
  if (!isEditable(type)) return 'type';
  if (!HOST.test(host)) return 'host';
  if (!isValidTtl(record.ttl)) return 'ttl';
  switch (type) {
    case 'A':
      return isIpv4(value) ? null : 'ipv4';
    case 'AAAA':
      return isIpv6(value) ? null : 'ipv6';
    case 'CNAME':
      if (host === '@') return 'cnameApex';
      return value !== '.' && isTarget(value) ? null : 'target';
    case 'NS':
      return value !== '.' && isTarget(value) ? null : 'target';
    case 'MX': {
      const match = /^(\d+)\s+(\S+)$/.exec(value);
      return match && u16(match[1]) && isTarget(match[2]) ? null : 'mx';
    }
    case 'TXT':
      // DKIM keys are long; KeyHelp splits them into strings itself. No line breaks.
      return value.length > 0 && value.length <= 8192 && !/[\r\n\0]/.test(value) ? null : 'txt';
    case 'SRV': {
      if (!/^_[a-z0-9-]+\._(?:tcp|udp|tls|sctp)(?:\..+)?$/i.test(host)) return 'srvHost';
      const match = /^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)$/.exec(value);
      return match && u16(match[1]) && u16(match[2]) && u16(match[3]) && isTarget(match[4]) ? null : 'srv';
    }
    case 'CAA': {
      const match = /^(\d{1,3})\s+([a-z0-9]+)\s+"([^"]*)"$/i.exec(value);
      if (!match || Number(match[1]) > 255 || !CAA_TAGS.includes(match[2].toLowerCase())) return 'caa';
      return null;
    }
  }
  return 'type';
}

/** The problems of a whole record set, by index. Records of types the editor does not offer are skipped. */
export function validateRecords(records: DnsRecord[]): { index: number; issue: DnsIssue }[] {
  const issues: { index: number; issue: DnsIssue }[] = [];
  const key = (host: string) => host.trim().toLowerCase();
  records.forEach((record, index) => {
    if (!isEditable(record.type.trim().toUpperCase())) return;
    const own = validateRecord(record);
    if (own) {
      issues.push({ index, issue: own });
      return;
    }
    // A CNAME must be the only record at its name (RFC 1034, 3.6.2).
    if (record.type.trim().toUpperCase() === 'CNAME') {
      const others = records.some((other, i) => i !== index && key(other.host) === key(record.host));
      if (others) issues.push({ index, issue: 'cnameConflict' });
    }
  });
  return issues;
}

/** Normalises a record before it is sent: trimmed, upper-case type. */
export function cleanRecord(record: DnsRecord): DnsRecord {
  return { host: record.host.trim(), ttl: record.ttl, type: record.type.trim().toUpperCase(), value: record.value.trim() };
}

/** Records that change how the zone is delegated; editing them gets a warning. */
export function isDelegationRecord(record: Pick<DnsRecord, 'type' | 'host'>): boolean {
  return record.type.trim().toUpperCase() === 'NS';
}

export function validateSoa(soa: DnsSoa): SoaIssue | null {
  const numbers = [soa.ttl, soa.refresh, soa.retry, soa.expire, soa.minimum];
  if (!numbers.every(isValidTtl)) return 'soaNumber';
  if (!NAME.test(soa.primary_ns.trim()) || !NAME.test(soa.rname.trim())) return 'soaName';
  return null;
}

/** Same host, type, value and TTL (the API has no record ids). */
export function sameRecord(a: DnsRecord, b: DnsRecord): boolean {
  const x = cleanRecord(a);
  const y = cleanRecord(b);
  return x.host.toLowerCase() === y.host.toLowerCase() && x.type === y.type && x.value === y.value && x.ttl === y.ttl;
}
