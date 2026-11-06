import { describe, expect, it } from 'vitest';
import {
  hostnameOf,
  isHostAllowed,
  isOriginAllowed,
  LOOPBACK_ONLY,
  resolveAllowedHosts,
} from '../../../src/devtools/host';

describe('hostnameOf', () => {
  it.each([
    ['localhost', 'localhost'],
    ['LOCALHOST:3000', 'localhost'],
    ['127.0.0.1:3000', '127.0.0.1'],
    ['192.168.1.20', '192.168.1.20'],
    ['[::1]:3000', '[::1]'],
    ['[::1]', '[::1]'],
    ['[fe80::1]:8080', '[fe80::1]'],
    ['my-app.test:443', 'my-app.test'],
    ['  example.com  ', 'example.com'],
  ])('reads %j as %j', (header, expected) => {
    expect(hostnameOf(header)).toBe(expected);
  });

  it.each([
    '',
    ' ',
    'a'.repeat(300),
    'bad host',
    'evil.com@good.com',
    'evil.com/path',
    'localhost:abc',
    'localhost:123456',
    '[::1',
    '[::1]x',
    '[not an address]:3000',
    '-leading.dash',
    'a..b',
    '999.1.1.1.1',
  ])('rejects %j', (header) => {
    expect(hostnameOf(header)).toBeNull();
  });
});

describe('isHostAllowed', () => {
  it.each([
    'localhost',
    'localhost:3000',
    'app.localhost:3000',
    '127.0.0.1:3000',
    '10.0.0.5:3000',
    '192.168.1.20:3000',
    '[::1]:3000',
    '[fe80::abcd]:3000',
  ])('serves %j without any configuration', (host) => {
    expect(isHostAllowed(host, LOOPBACK_ONLY)).toBe(true);
  });

  it.each([
    'evil.example',
    'evil.example:3000',
    'attacker.com',
    'localhost.evil.com',
    'notlocalhost',
    '127.0.0.1.evil.com',
    'bad host',
    '',
  ])('refuses %j: a rebound foreign domain name', (host) => {
    expect(isHostAllowed(host, LOOPBACK_ONLY)).toBe(false);
  });

  it('serves a request that has no Host header at all', () => {
    expect(isHostAllowed(undefined, LOOPBACK_ONLY)).toBe(true);
  });

  it('serves the names that were configured, exactly', () => {
    const allowed = { all: false, names: ['myapp.test'] };
    expect(isHostAllowed('myapp.test:3000', allowed)).toBe(true);
    expect(isHostAllowed('MYAPP.TEST', allowed)).toBe(true);
    expect(isHostAllowed('other.test', allowed)).toBe(false);
    expect(isHostAllowed('sub.myapp.test', allowed)).toBe(false);
    expect(isHostAllowed('evilmyapp.test', allowed)).toBe(false);
  });

  it('treats a leading dot as "this name and its subdomains", like Vite', () => {
    const allowed = { all: false, names: ['.myapp.test'] };
    expect(isHostAllowed('myapp.test', allowed)).toBe(true);
    expect(isHostAllowed('a.b.myapp.test', allowed)).toBe(true);
    expect(isHostAllowed('evilmyapp.test', allowed)).toBe(false);
    expect(isHostAllowed('myapp.test.evil.com', allowed)).toBe(false);
  });

  it('serves any well-formed name when everything is allowed, but still not a malformed one', () => {
    const all = { all: true, names: [] };
    expect(isHostAllowed('anything.example', all)).toBe(true);
    expect(isHostAllowed('bad host', all)).toBe(false);
  });
});

describe('isOriginAllowed', () => {
  it('allows a request without an Origin header (same-origin reads send none)', () => {
    expect(isOriginAllowed(undefined, 'localhost:3000')).toBe(true);
  });

  it('allows an Origin with the same host and port', () => {
    expect(isOriginAllowed('http://localhost:3000', 'localhost:3000')).toBe(true);
    expect(isOriginAllowed('http://LOCALHOST:3000', 'localhost:3000')).toBe(true);
    expect(isOriginAllowed('https://192.168.1.2:3000', '192.168.1.2:3000')).toBe(true);
  });

  it.each([
    ['http://evil.example', 'localhost:3000'],
    ['http://localhost:4000', 'localhost:3000'],
    ['http://localhost', 'localhost:3000'],
    ['null', 'localhost:3000'],
    ['not a url', 'localhost:3000'],
    ['', 'localhost:3000'],
    ['http://localhost:3000', undefined],
  ])('refuses Origin %j for Host %j', (origin, host) => {
    expect(isOriginAllowed(origin, host)).toBe(false);
  });
});

describe('resolveAllowedHosts', () => {
  it('takes the configured dev server host and Vite’s allowed hosts', () => {
    expect(resolveAllowedHosts('Dev.Example', ['.team.test', 'other.test'])).toEqual({
      all: false,
      names: ['dev.example', '.team.test', 'other.test'],
    });
  });

  it('ignores wildcard bind addresses, which are not names a browser would send', () => {
    expect(resolveAllowedHosts('0.0.0.0', undefined).names).toEqual([]);
    expect(resolveAllowedHosts('::', undefined).names).toEqual([]);
    expect(resolveAllowedHosts('*', ['*']).names).toEqual([]);
    expect(resolveAllowedHosts('', [''])).toEqual({ all: false, names: [] });
  });

  it('allows everything only when Vite is told to', () => {
    expect(resolveAllowedHosts('localhost', true)).toEqual({ all: true, names: [] });
    expect(resolveAllowedHosts('localhost', 'true').all).toBe(false);
  });

  it('ignores values of an unexpected type instead of throwing', () => {
    expect(resolveAllowedHosts(undefined, undefined)).toEqual({ all: false, names: [] });
    expect(resolveAllowedHosts(42, [1, null, {}, 'ok.test'])).toEqual({
      all: false,
      names: ['ok.test'],
    });
    expect(resolveAllowedHosts({}, 'nope')).toEqual({ all: false, names: [] });
  });
});
