import type { MetadataRoute } from 'next';

const BASE_URL = 'https://archonhq.ai';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Exclude internal dashboard pages and API routes from indexing
        disallow: ['/dashboard/', '/api/', '/auth/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
