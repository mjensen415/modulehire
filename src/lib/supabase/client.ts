import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy',
    {
      cookieOptions: {
        // Share session across modulehire.com and business.modulehire.com
        domain: typeof window !== 'undefined' && window.location.hostname.endsWith('modulehire.com')
          ? '.modulehire.com'
          : undefined,
      },
    }
  )
}
