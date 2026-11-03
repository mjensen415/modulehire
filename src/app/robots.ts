// /robots.txt: crawl the public pages, skip the API, the signed-in app and one-time link routes.
import type { MetadataRoute } from 'next'
import { appUrl } from '@/lib/mcp/urls'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/go/',
        '/oauth/',
        '/auth/',
        '/onboarding',
        '/account',
        '/admin',
        '/applications',
        '/billing',
        '/dashboard',
        '/generate',
        '/interview-prep',
        '/job-tracker',
        '/library',
        '/matches',
        '/module-review',
        '/module-selection',
        '/my-info',
        '/preferences',
        '/preview',
        '/resumes',
        '/settings',
        '/upload',
        '/business/',
      ],
    },
    sitemap: appUrl('/sitemap.xml'),
  }
}
