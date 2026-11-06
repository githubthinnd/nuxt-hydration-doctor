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

  describe('a handler assigned by someone else afterwards', () => {
    it('is chained after the doctor instead of replacing it', () => {
      const app = host();
      const onWarning = vi.fn();
      const print = vi.fn();
      installWarnHandler(app, onWarning, () => undefined, print);

      const later = vi.fn();
      app.config.warnHandler = later;
      app.config.warnHandler('boom', null, 'at <App>');

      expect(onWarning).toHaveBeenCalledTimes(1);
      expect(later).toHaveBeenCalledWith('boom', null, 'at <App>');
      expect(print).not.toHaveBeenCalled();
    });

    it('falls back to printing like Vue when it is cleared again', () => {
      const app = host(vi.fn());
      const print = vi.fn();
      installWarnHandler(
        app,
        () => undefined,
        () => undefined,
        print,
      );

      app.config.warnHandler = undefined;
      // Read back through a function: assigning undefined narrows the property's type to undefined.
      const current = (): WarnHandler | undefined => app.config.warnHandler;
      current()?.('boom', null, '');

      expect(print).toHaveBeenCalledWith('[Vue warn]: boom');
    });

    it('is what remains after the doctor is removed', () => {
      const app = host();
      const restore = installWarnHandler(
        app,
        () => undefined,
        () => undefined,
        () => undefined,
      );
      const later = vi.fn();
      app.config.warnHandler = later;

      restore();

      expect(app.config.warnHandler).toBe(later);
      expect(Object.getOwnPropertyDescriptor(app.config, 'warnHandler')?.writable).toBe(true);
    });
  });

  it('keeps the property enumerable and configurable, like the plain value it replaced', () => {
    const app = host(vi.fn());
    installWarnHandler(
      app,
      () => undefined,
      () => undefined,
      () => undefined,
    );
    const descriptor = Object.getOwnPropertyDescriptor(app.config, 'warnHandler');
    expect(descriptor?.enumerable).toBe(true);
    expect(descriptor?.configurable).toBe(true);
  });
});
