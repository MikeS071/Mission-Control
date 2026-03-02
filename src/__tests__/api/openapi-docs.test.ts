import { GET as openApiGet } from '@/app/api/openapi/route';
import { GET as docsGet } from '@/app/api/docs/route';

describe('openapi and docs routes', () => {
  it('GET /api/openapi returns a valid OpenAPI schema payload', async () => {
    const response = await openApiGet();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      openapi: '3.0.3',
      info: {
        title: 'Mission Control API',
        version: '1.0.0',
      },
      paths: expect.any(Object),
      components: expect.any(Object),
    });
    expect(json.paths['/api/tasks']).toBeDefined();
  });

  it('GET /api/openapi sets application/json content-type', async () => {
    const response = await openApiGet();

    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('GET /api/docs returns HTML content for Swagger UI', async () => {
    const response = await docsGet();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('<!DOCTYPE html>');
    expect(text).toContain('SwaggerUIBundle');
    expect(text).toContain("url: '/api/openapi'");
  });

  it('GET /api/docs sets text/html charset content-type', async () => {
    const response = await docsGet();

    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
  });
});
