// How HTTP handlers must behave, so route code does not drift per file.

export const id = 'api-routes';
export const number = 14;
export const title = 'API route method rules';
export const when = (signals) => signals.httpRoutes.present;
export const requires = 'HTTP routes';

export function text(signals) {
  return `# 14. API route method rules

{{ROUTE_CONVENTIONS}}

- Validate input at the boundary before any work happens.
- Return the documented status codes, not a generic 500 for expected failures.
- Authorize at the route, not only in the interface that calls it.`;
}
