import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../src/env.js';
import { sendCodeEmail } from '../src/services/email.js';

/**
 * The dev-only code logging is a real convenience and a real hazard: if it ever
 * leaked into production, every verification code would sit in the log stream.
 */
describe('sendCodeEmail', () => {
  function spyLog() {
    return vi.spyOn(console, 'log').mockImplementation(() => {});
  }

  it('logs the code outside production', async () => {
    const log = spyLog();
    try {
      await sendCodeEmail(
        { ...env, ENVIRONMENT: 'development' } as unknown as Env,
        'dev@example.com',
        'verify',
        '123456',
      );
      expect(log.mock.calls.flat().join(' ')).toContain('123456');
    } finally {
      log.mockRestore();
    }
  });

  it('never logs the code in production', async () => {
    const log = spyLog();
    try {
      await sendCodeEmail(
        { ...env, ENVIRONMENT: 'production' } as unknown as Env,
        'prod@example.com',
        'verify',
        '654321',
      );
      expect(log.mock.calls.flat().join(' ')).not.toContain('654321');
    } finally {
      log.mockRestore();
    }
  });

  it('still reports a log channel in production when there is no binding', async () => {
    const log = spyLog();
    try {
      const channel = await sendCodeEmail(
        { ...env, EMAIL: undefined, ENVIRONMENT: 'production' } as unknown as Env,
        'prod@example.com',
        'reset',
        '111222',
      );
      // The caller learns delivery did not happen, without the code reaching logs.
      expect(channel).toBe('log');
      expect(log.mock.calls.flat().join(' ')).not.toContain('111222');
    } finally {
      log.mockRestore();
    }
  });
});
