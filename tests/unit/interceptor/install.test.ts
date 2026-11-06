import { describe, expect, it, vi } from 'vitest';
import { installWarnHandler, type WarnHandler } from '../../../src/runtime/interceptor/install';

function host(warnHandler?: WarnHandler): { config: { warnHandler?: WarnHandler | undefined } } {
  return { config: warnHandler === undefined ? {} : { warnHandler } };
}

describe('installWarnHandler', () => {
  it('feeds the warning to the doctor and still prints it like Vue when there was no handler', () => {
    const app = host();
    const onWarning = vi.fn();
    const print = vi.fn();
    installWarnHandler(app, onWarning, () => undefined, print);

    app.config.warnHandler?.('boom', null, 'at <App>');

    expect(onWarning).toHaveBeenCalledWith('boom', null, 'at <App>');
    expect(print).toHaveBeenCalledWith('[Vue warn]: boom\nat <App>');
  });

  it('omits the trace line when there is none', () => {
    const app = host();
    const print = vi.fn();
    installWarnHandler(
      app,
      () => undefined,
      () => undefined,
      print,
    );
    app.config.warnHandler?.('boom', null, '');
    expect(print).toHaveBeenCalledWith('[Vue warn]: boom');
  });

  it('calls an existing handler instead of printing', () => {
    const previous = vi.fn();
    const app = host(previous);
    const print = vi.fn();
    installWarnHandler(
      app,
      () => undefined,
      () => undefined,
      print,
    );

    app.config.warnHandler?.('boom', null, 'at <App>');

    expect(previous).toHaveBeenCalledWith('boom', null, 'at <App>');
    expect(print).not.toHaveBeenCalled();
  });

  it('never lets a failing doctor swallow the warning or throw into Vue', () => {
    const previous = vi.fn();
    const app = host(previous);
    const onInternalError = vi.fn();
    installWarnHandler(
      app,
      () => {
        throw new Error('doctor bug');
      },
      onInternalError,
      () => undefined,
    );

    expect(() => app.config.warnHandler?.('boom', null, '')).not.toThrow();
    expect(onInternalError).toHaveBeenCalledTimes(1);
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('restores the previous handler', () => {
    const previous = vi.fn();
    const app = host(previous);
    const restore = installWarnHandler(
      app,
      () => undefined,
      () => undefined,
      () => undefined,
    );
    restore();
    expect(app.config.warnHandler).toBe(previous);
  });
});
