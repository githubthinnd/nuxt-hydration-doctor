import type { ComponentPublicInstance } from 'vue';

export type WarnHandler = (
  message: string,
  instance: ComponentPublicInstance | null,
  trace: string,
) => void;

/** The part of a Vue app this module touches; structural so it can be tested without Vue. */
export interface WarnHandlerHost {
  readonly config: { warnHandler?: WarnHandler | undefined };
}

/**
 * Chains `onWarning` in front of whatever `warnHandler` the app has.
 *
 * Setting `app.config.warnHandler` silences Vue's default console output, so the original
 * behaviour is preserved explicitly: an existing handler is still called, and without one the
 * warning is printed the way Vue prints it. `onWarning` runs first and is isolated, so a bug in
 * the doctor can neither swallow a warning nor throw into Vue's render pipeline.
 *
 * `warnHandler` becomes an accessor property. Vue reads it every time it warns, and a plain value
 * would be lost to any plugin that later assigns its own handler; with the accessor such an
 * assignment becomes the handler that is chained *after* ours, so both keep working, whatever the
 * plugin order.
 *
 * Returns a function that puts the previous handler back as a plain value.
 */
export function installWarnHandler(
  host: WarnHandlerHost,
  onWarning: WarnHandler,
  onInternalError: (error: unknown) => void,
  print: (text: string) => void,
): () => void {
  const config = host.config;
  const original = Object.getOwnPropertyDescriptor(config, 'warnHandler');
  let next: WarnHandler | undefined = config.warnHandler;

  const handler: WarnHandler = (message, instance, trace) => {
    try {
      onWarning(message, instance, trace);
    } catch (error) {
      onInternalError(error);
    }
    if (next === undefined) {
      print(`[Vue warn]: ${message}${trace === '' ? '' : `\n${trace}`}`);
    } else {
      next(message, instance, trace);
    }
  };

  Object.defineProperty(config, 'warnHandler', {
    configurable: true,
    enumerable: true,
    get: () => handler,
    set: (value: WarnHandler | undefined) => {
      next = value;
    },
  });

  return () => {
    // Back to what was there, including a handler assigned by someone else since.
    Object.defineProperty(
      config,
      'warnHandler',
      original?.get === undefined && original?.set === undefined
        ? { configurable: true, enumerable: true, writable: true, value: next }
        : original,
    );
  };
}
