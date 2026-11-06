import { describe, expect, it } from 'vitest';
import { createReportRegistry } from '../../../src/devtools/registry';
import { makeReport } from '../../support/report';

describe('createReportRegistry', () => {
  it('numbers reports in order and stamps the receive time', () => {
    let clock = 1000;
    const registry = createReportRegistry(10, () => clock);
    const first = registry.add(makeReport());
    clock = 2000;
    const second = registry.add(makeReport({ pageLoadId: 'load-2' }));

    expect([first.seq, first.receivedAt]).toEqual([1, 1000]);
    expect([second.seq, second.receivedAt]).toEqual([2, 2000]);
    expect(registry.latest()).toBe(2);
  });

  it('returns only what is newer than a given sequence number', () => {
    const registry = createReportRegistry(10, () => 0);
    for (let i = 0; i < 3; i += 1) registry.add(makeReport());
    expect(registry.since(0).map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(registry.since(2).map((r) => r.seq)).toEqual([3]);
    expect(registry.since(3)).toEqual([]);
    expect(registry.since(99)).toEqual([]);
  });

  it('drops the oldest reports beyond the limit but never reuses a number', () => {
    const registry = createReportRegistry(2, () => 0);
    for (let i = 0; i < 4; i += 1) registry.add(makeReport());
    expect(registry.since(0).map((r) => r.seq)).toEqual([3, 4]);
    expect(registry.add(makeReport()).seq).toBe(5);
  });

  it('forgets everything on clear and changes generation so pollers notice', () => {
    const registry = createReportRegistry(10, () => 0);
    registry.add(makeReport());
    const before = registry.generation();
    registry.clear();
    expect(registry.since(0)).toEqual([]);
    expect(registry.generation()).toBe(before + 1);
    expect(registry.add(makeReport()).seq).toBe(2);
  });
});
