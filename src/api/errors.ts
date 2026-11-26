// Errors of the API client, sorted into the kinds the screens explain differently.

export type ErrorKind =
  /** The address is not https:// (the app never sends an API key in the clear). */
  | 'insecure'
  /** The address cannot be parsed. */
  | 'invalidUrl'
  /** TLS failed: expired, self-signed or wrong-host certificate. */
  | 'certificate'
  /** No answer: offline, DNS, firewall, IP restriction of the key, or (web only) CORS. */
  | 'network'
  | 'timeout'
  /** 401: the key is wrong or was deleted. */
  | 'unauthorized'
  /** 403: the API is turned off, or the key is not allowed from this IP. */
  | 'forbidden'
  | 'notFound'
  /** 400: the server rejected the input; `message` holds its reason. */
  | 'badRequest'
  /** 5xx, also while the server reloads its web server after a change. */
  | 'server'
  /** The answer is not the JSON the endpoint documents. */
  | 'invalidResponse';

export class KeyHelpError extends Error {
  readonly kind: ErrorKind;
  readonly status?: number;
  /** The `message` of the API's error body, when it sent one. */
  readonly apiMessage?: string;

  constructor(kind: ErrorKind, message: string, options: { status?: number; apiMessage?: string } = {}) {
    super(message);
    this.name = 'KeyHelpError';
    this.kind = kind;
    this.status = options.status;
    this.apiMessage = options.apiMessage;
  }
}

// What the platforms put into the message of a failed TLS handshake: iOS (NSURLErrorDomain
// -1202 and friends), Android (OkHttp / javax.net.ssl) and the browsers' net::ERR_CERT_* codes.
const CERTIFICATE_PATTERNS = [
  /certificate/i,
  /\bSSL\b/i,
  /\bTLS\b/i,
  /CertPath/i,
  /trust anchor/i,
  /ERR_CERT_/i,
  /-120[0-6]\b/,
  /hostname .* not verified/i,
];

/** Sorts an error thrown by fetch (not an HTTP status) into a kind. */
export function classifyFetchError(error: unknown): KeyHelpError {
  if (error instanceof KeyHelpError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';
  if (name === 'AbortError' || /timed? ?out/i.test(message)) {
    return new KeyHelpError('timeout', message);
  }
  if (CERTIFICATE_PATTERNS.some((pattern) => pattern.test(message))) {
    return new KeyHelpError('certificate', message);
  }
  return new KeyHelpError('network', message);
}

/** Sorts an HTTP error status into a kind. */
export function kindForStatus(status: number): ErrorKind {
  if (status === 400 || status === 422) return 'badRequest';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status >= 500) return 'server';
  return 'invalidResponse';
}
