// Vitest alias target for the "server-only" package (see vitest.config.ts).
// The real package unconditionally throws when imported outside Next.js's
// webpack-injected "react-server" resolution condition, which plain Node
// (i.e. Vitest) never sets — so every server module's `import "server-only"`
// would throw immediately under test. This is the standard, documented
// Next.js + Vitest pattern: alias the package to a no-op in test config
// rather than stripping the guard from source files (this repo's prior,
// non-durable pattern for throwaway test scripts).
export {};
