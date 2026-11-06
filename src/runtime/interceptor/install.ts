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
 * Chains `onWarning` in front of whatever `warnHandler` the app already has.
 *
 * Setting `app.config.warnHandler` silences Vue's default console output, so the original
 * behaviour is preserved explicitly: an existing handler is still called, and without one the
 * warning is printed the way Vue prints it. `onWarning` runs first and is isolated, so a bug in
 * the doctor can neither swallow a warning nor throw into Vue's render pipeline.
 *
 * Returns a function that restores the previous handler.
 */
export function installWarnHandler(
  host: WarnHandlerHost,
  onWarning: WarnHandler,
  onInternalError: (error: unknown) => void,
  print: (text: string) => void,
): () => void {
  const previous = host.config.warnHandler;

  host.config.warnHandler = (message, instance, trace) => {
    try {
      onWarning(message, instance, trace);
    } catch (error) {
      onInternalError(error);
    }
    if (previous === undefined) {
      print(`[Vue warn]: ${message}${trace === '' ? '' : `\n${trace}`}`);
    } else {
      previous(message, instance, trace);
    }
  };

  return () => {
    host.config.warnHandler = previous;
  };
}
