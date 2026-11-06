/**
 * Which `Host` headers the dev endpoint answers to.
 *
 * Why: a page on a hostile site can make the browser send requests to your dev server under the
 * hostile site's own domain name once that name has been re-pointed at 127.0.0.1 ("DNS
 * rebinding"). Such a request is same-origin as far as the browser is concerned, so the cross-site
 * checks cannot see it; but its `Host` header is the attacker's domain name. Names are therefore
 * refused unless they are loopback names or were configured, while IP addresses are accepted (an
 * attacker cannot make a browser send an IP literal that is not already the real target), which
 * keeps testing from a phone at `http://192.168.1.20:3000` working.
 */
export interface AllowedHosts {
  /** Accept any name (`vite.server.allowedHosts: true`). */
  readonly all: boolean;
  /** Extra names. An entry starting with "." also matches its subdomains, as in Vite. */
  readonly names: readonly string[];
}

export const LOOPBACK_ONLY: AllowedHosts = { all: false, names: [] };

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6 = /^\[[0-9a-f:.]+\]$/;
const LABEL = /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/;

/**
 * A DNS name: non-empty labels of letters, digits, "-" and "_", whose last label is not all
 * digits (a name like `999.1.1.1.1` is neither an address nor a name a browser would send).
 */
function isDnsName(name: string): boolean {
  const labels = name.split('.');
  const last = labels[labels.length - 1] ?? '';
  return labels.every((label) => LABEL.test(label)) && /[a-z_-]/.test(last);
}

/** Host names that mean "this machine" and so cannot be a rebound foreign domain. */
function isLoopbackName(name: string): boolean {
  return name === 'localhost' || name.endsWith('.localhost');
}

/**
 * The host name of a `Host` header value (lower-cased, port removed, IPv6 keeps its brackets), or
 * null when the value is not a plausible host.
 */
export function hostnameOf(hostHeader: string): string | null {
  const value = hostHeader.trim().toLowerCase();
  if (value === '' || value.length > 255) return null;
  if (value.startsWith('[')) {
    const close = value.indexOf(']');
    if (close === -1) return null;
    const rest = value.slice(close + 1);
    if (rest !== '' && !/^:\d{1,5}$/.test(rest)) return null;
    const bracketed = value.slice(0, close + 1);
    return IPV6.test(bracketed) ? bracketed : null;
  }
  const colon = value.lastIndexOf(':');
  const name = colon === -1 ? value : value.slice(0, colon);
  if (colon !== -1 && !/^\d{1,5}$/.test(value.slice(colon + 1))) return null;
  return IPV4.test(name) || isDnsName(name) ? name : null;
}

/** True when a request with this `Host` header may be served. A missing header is allowed. */
export function isHostAllowed(hostHeader: string | undefined, allowed: AllowedHosts): boolean {
  if (hostHeader === undefined) return true;
  const name = hostnameOf(hostHeader);
  if (name === null) return false;
  if (allowed.all || isLoopbackName(name) || IPV4.test(name) || IPV6.test(name)) return true;
  return allowed.names.some((entry) =>
    entry.startsWith('.') ? name === entry.slice(1) || name.endsWith(entry) : name === entry,
  );
}

/**
 * True when the request does not name a different origin than the one it was sent to. `Origin` is
 * only present on cross-origin requests and on same-origin writes; when it is there it must have
 * the same host (and port) as `Host`. `null` (a sandboxed frame, a data: URL) never matches.
 */
export function isOriginAllowed(
  origin: string | undefined,
  hostHeader: string | undefined,
): boolean {
  if (origin === undefined) return true;
  if (hostHeader === undefined) return false;
  try {
    return new URL(origin).host.toLowerCase() === hostHeader.trim().toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Builds the allow-list from Nuxt's configuration: the host the dev server was told to listen on
 * (`devServer.host`, unless that is a wildcard bind address) and Vite's `allowedHosts`. Anything
 * of an unexpected type is ignored, which only ever makes the list shorter.
 */
export function resolveAllowedHosts(
  devServerHost: unknown,
  viteAllowedHosts: unknown,
): AllowedHosts {
  if (viteAllowedHosts === true) return { all: true, names: [] };
  const names: string[] = [];
  const add = (value: unknown): void => {
    if (typeof value !== 'string') return;
    const entry = value.trim().toLowerCase();
    if (entry === '' || entry === '*' || entry === '0.0.0.0' || entry === '::') return;
    names.push(entry);
  };
  add(devServerHost);
  if (Array.isArray(viteAllowedHosts))
    for (const entry of viteAllowedHosts as unknown[]) add(entry);
  return { all: false, names };
}
