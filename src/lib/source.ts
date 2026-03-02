import { docs } from '@/.source/server';
import { loader, source as createSource } from 'fumadocs-core/source';

export const source = loader({
  baseUrl: '/docs',
  source: createSource(docs),
});
