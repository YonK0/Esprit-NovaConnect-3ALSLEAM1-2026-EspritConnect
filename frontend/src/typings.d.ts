/**
 * Ambient module declarations for third-party packages that don't ship
 * their own TypeScript types and have no @types/* counterpart on npm.
 *
 * Keep entries terse — typing the full API surface is rarely worth the
 * maintenance cost compared to "any" plus the per-call casts at usage
 * sites. Add a JSDoc note saying why each module is here.
 */

// jsvectormap: SVG world-map library used by the admin stats dashboard.
// No @types/jsvectormap exists, and writing a precise declaration would
// be a substantial undertaking for one consumer.
declare module 'jsvectormap';
declare module 'jsvectormap/dist/maps/world-merc.js';
