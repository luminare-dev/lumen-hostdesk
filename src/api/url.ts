import { KeyHelpError } from './errors';

/** The path of API v2 below the panel's address. */
export const API_PREFIX = '/api/v2';

// scheme://host[:port][/path][?query][#fragment]. Parsed by hand: React Native's URL class does
// not implement hostname, port or pathname.
const ADDRESS = /^(?:([a-z][a-z0-9+.-]*):\/\/)?([^/?#]*)([^?#]*)(?:\?[^#]*)?(?:#.*)?$/i;
const HOST_NAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const IPV6 = /^\[[0-9a-f:.]+\]$/i;

/**
 * Turns what a person types ("panel.example.org", "https://panel.example.org/api/v2/") into the
 * panel's origin ("https://panel.example.org"). A missing scheme means https; http:// (or any
 * other scheme) is refused, because the API key would travel in the clear. A trailing /api/v2 is
 * accepted as the same panel; any other path is refused so a typo does not go unnoticed.
 */
export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '') throw new KeyHelpError('invalidUrl', 'empty address');
  const match = ADDRESS.exec(trimmed);
  if (!match) throw new KeyHelpError('invalidUrl', `not an address: ${trimmed}`);
  const [, scheme, authority, rawPath] = match;
  if (scheme !== undefined && scheme.toLowerCase() !== 'https') {
    throw new KeyHelpError('insecure', `${scheme}:// is not allowed`);
  }
  if (authority.includes('@')) {
    throw new KeyHelpError('invalidUrl', 'the address must not contain a user name or password');
  }
  const portMatch = /^(.*?)(?::(\d{1,5}))?$/.exec(authority);
  const host = (portMatch?.[1] ?? '').toLowerCase();
  const port = portMatch?.[2];
  const hostOk =
    IPV4.test(host) || IPV6.test(host) || host === 'localhost' || (HOST_NAME.test(host) && host.includes('.'));
  if (!hostOk) throw new KeyHelpError('invalidUrl', `not a host name: ${host || trimmed}`);
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) {
    throw new KeyHelpError('invalidUrl', `not a port: ${port}`);
  }
  const path = rawPath.replace(/\/+$/, '');
  if (path !== '' && path.toLowerCase() !== API_PREFIX) {
    throw new KeyHelpError('invalidUrl', `unexpected path ${rawPath}; enter the panel's address only`);
  }
  const portPart = port === undefined || port === '443' ? '' : `:${port}`;
  return `https://${host}${portPart}`;
}

/** The label for a server: its host name (and port). */
export function hostOf(origin: string): string {
  return origin.replace(/^https:\/\//, '');
}
