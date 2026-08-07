// Next.js requires the middleware entry point to be named middleware.ts.
// All logic lives in src/proxy.ts so it can be imported by tests without
// pulling in the Next.js runtime.
export { proxy as middleware, config } from './proxy'
