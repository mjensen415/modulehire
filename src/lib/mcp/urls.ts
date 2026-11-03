// Absolute links into the web app, for tool results the user may click from their AI client.
export function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://modulehire.com').replace(/\/+$/, '')
  return `${base}${path}`
}
