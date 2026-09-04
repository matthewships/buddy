import { sql, type SQL } from 'drizzle-orm';

import { ADULT_AGE_YEARS } from '@buddy/shared';

import { users } from '../db/schema.js';

/**
 * The adult line in SQL (PRODUCT.md §6.3).
 *
 * `isMinor` in packages/shared decides one person; the directory needs the
 * same rule as a WHERE clause over everybody. A viewer under the line sees only
 * users whose recorded birth date also puts them under it; everyone else sees
 * only users who are over it or have no recorded date — because an unrecorded
 * age is read as adult, the same call `isMinor` makes when it returns null.
 *
 * The cut-off date is computed once here rather than per row: somebody is a
 * minor if they were born after today minus eighteen years, and comparing two
 * `YYYY-MM-DD` strings lexicographically is exactly the comparison of dates.
 */
export function adultLineCondition(viewerIsMinor: boolean | null, on: Date = new Date()): SQL {
  const cutoff = new Date(Date.UTC(on.getUTCFullYear() - ADULT_AGE_YEARS, on.getUTCMonth(), on.getUTCDate()))
    .toISOString()
    .slice(0, 10);
  return viewerIsMinor
    ? sql`${users.dateOfBirth} IS NOT NULL AND ${users.dateOfBirth} > ${cutoff}`
    : sql`(${users.dateOfBirth} IS NULL OR ${users.dateOfBirth} <= ${cutoff})`;
}
