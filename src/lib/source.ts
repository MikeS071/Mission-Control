// Fumadocs generates this module at build time; it may not exist during isolated type checks.
// @ts-expect-error build-time generated module
import { docs } from '@/.source/server';
import { loader } from 'fumadocs-core/source';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
