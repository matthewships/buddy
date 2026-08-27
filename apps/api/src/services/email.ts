import { EMAIL_CODE_TTL_MS, type EmailCodePurpose } from '@buddy/shared';

import type { Env } from '../env.js';

/**
 * Transactional email (§4.1): verification and password-reset codes, sent
 * through the Cloudflare Email Sending binding from the app's own domain.
 *
 * The binding is optional at the type level on purpose: it only works once the
 * sender domain has been onboarded to Email Service (SPF/DKIM records).
 *
 * Outside production the code is also written to the log. That is what makes
 * local signup possible before the domain is onboarded, and it is how the test
 * suite reads codes back — exercising the real issue-and-consume path instead of
 * reaching into the codes table and bypassing the hashing. In production the
 * code is never logged, whether delivery succeeded or not.
 */

export type DeliveryChannel = 'email' | 'log';

interface Message {
  subject: string;
  text: string;
  html: string;
}

const minutes = Math.round(EMAIL_CODE_TTL_MS / 60_000);

function verificationMessage(code: string): Message {
  return {
    subject: `${code} is your Buddy verification code`,
    text: [
      'Welcome to Buddy.',
      '',
      `Your verification code is ${code}.`,
      `It expires in ${minutes} minutes.`,
      '',
      "If you didn't create a Buddy account, you can ignore this email.",
    ].join('\n'),
    html: wrap(
      'Welcome to Buddy',
      `<p>Your verification code is:</p>${codeBlock(code)}<p>It expires in ${minutes} minutes.</p>
       <p style="color:#64748b">If you didn't create a Buddy account, you can ignore this email.</p>`,
    ),
  };
}

function resetMessage(code: string): Message {
  return {
    subject: `${code} is your Buddy password reset code`,
    text: [
      'Someone asked to reset the password on your Buddy account.',
      '',
      `Your reset code is ${code}.`,
      `It expires in ${minutes} minutes.`,
      '',
      "If this wasn't you, ignore this email — your password has not changed.",
    ].join('\n'),
    html: wrap(
      'Reset your password',
      `<p>Your password reset code is:</p>${codeBlock(code)}<p>It expires in ${minutes} minutes.</p>
       <p style="color:#64748b">If this wasn't you, ignore this email — your password has not changed.</p>`,
    ),
  };
}

function codeBlock(code: string): string {
  return `<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>`;
}

function wrap(heading: string, body: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a;line-height:1.5">
<h1 style="font-size:20px">${heading}</h1>${body}</body></html>`;
}

/**
 * Sends a code. Never throws on a delivery failure: a registration must not be
 * rolled back because an email bounced — the user can always request a resend.
 * Failures are logged and reported as the 'log' channel.
 */
export async function sendCodeEmail(
  env: Env,
  to: string,
  purpose: EmailCodePurpose,
  code: string,
): Promise<DeliveryChannel> {
  const message = purpose === 'verify' ? verificationMessage(code) : resetMessage(code);

  // Never log a live code in production, regardless of delivery outcome.
  const mayLogCode = env.ENVIRONMENT !== 'production';
  const logCode = () => {
    if (mayLogCode) console.log(`[email:log] to=${to} purpose=${purpose} code=${code}`);
  };

  if (!env.EMAIL) {
    logCode();
    return 'log';
  }

  try {
    await env.EMAIL.send({
      to,
      from: env.EMAIL_FROM,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    logCode();
    return 'email';
  } catch (error) {
    // Logged, not thrown: see the note above.
    console.error(`[email:failed] to=${to} purpose=${purpose}`, error);
    logCode();
    return 'log';
  }
}
