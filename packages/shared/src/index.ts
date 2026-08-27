/**
 * Barrel for the shared package.
 *
 * Relative imports here are deliberately extensionless. Metro resolves import
 * specifiers literally and does not map a `.js` specifier onto a `.ts` file, so
 * a `./badges.js` import breaks the Expo bundle the moment the app imports this
 * package at runtime. Both consumers (Metro, and esbuild via wrangler) resolve
 * extensionless TypeScript, so this is the form that works for both.
 */
export * from './badges';
export * from './credits';
export * from './enums';
export * from './goals';
export * from './limits';
export * from './occupations';
export * from './schemas';
