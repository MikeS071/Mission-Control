import { NextResponse } from 'next/server';

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Mission Control API',
    version: '1.0.0',
    description:
      'REST API for Mission Control task orchestration. Authentication supports Bearer token or session cookie.',
  },
  servers: [{ url: '/', description: 'Current host' }],
  security: [{ bearerAuth: [] }, { sessionCookie: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      sessionCookie: { type: 'apiKey', in: 'cookie', name: 'next-auth.session-token' },
    },
    schemas: {
      Task: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 12 },
          title: { type: 'string', example: 'Draft release notes' },
          description: { type: 'string', example: 'Capture key updates for sprint handoff.' },
          status: { type: 'string', enum: ['todo', 'in_progress', 'done'], example: 'todo' },
          priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'], example: 'High' },
          goal: { type: 'string', example: 'Goal 2' },
          assignedAgent: { type: 'string', nullable: true, example: 'Navi (main)' },
          tags: { type: 'string', example: 'release,docs' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Event: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 101 },
          taskId: { type: 'integer', nullable: true, example: 12 },
          agentName: { type: 'string', nullable: true, example: 'system' },
          eventType: { type: 'string', example: 'status_change' },
          payload: { type: 'string', example: 'Status: todo → in_progress' },
          createdAt: { type: 'string', format: 'date-time' },
          taskTitle: { type: 'string', nullable: true, example: 'Draft release notes' },
        },
      },
      Heartbeat: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 24 },
          source: { type: 'string', example: 'gateway' },
          status: { type: 'string', enum: ['ok', 'error', 'unknown'], example: 'ok' },
          payload: { type: 'string', example: '{"latencyMs":72}' },
          checkedAt: { type: 'string', format: 'date-time' },
        },
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'string', example: 'Task not found' } },
      },
    },
  },
  paths: {
    '/api/tasks': {
      get: {
        summary: 'List tasks',
        responses: {
          '200': {
            description: 'Task list',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Task' } } } },
          },
        },
      },
      post: {
        summary: 'Create task',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  goal: { type: 'string' },
                  priority: { type: 'string' },
                  status: { type: 'string' },
                  tags: { type: 'string' },
                  assignedAgent: { type: 'string', nullable: true },
                },
              },
              example: {
                title: 'Draft release notes',
                description: 'Summarise completed work',
                goal: 'Goal 2',
                priority: 'High',
                status: 'todo',
                tags: 'release,docs',
                assignedAgent: 'Navi (main)',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Created task',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } },
          },
        },
      },
      patch: {
        summary: 'Update task (by id in body)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id'],
                properties: {
                  id: { type: 'integer' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  goal: { type: 'string' },
                  priority: { type: 'string' },
                  status: { type: 'string' },
                  tags: { type: 'string' },
                  assignedAgent: { type: 'string', nullable: true },
                },
              },
              example: { id: 12, status: 'in_progress', priority: 'Critical' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated task',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } },
          },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        summary: 'Delete task (by id in body)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } },
              example: { id: 12 },
            },
          },
        },
        responses: {
          '200': { description: 'Delete result', content: { 'application/json': { example: { ok: true } } } },
          '400': { description: 'Validation error' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/api/events': {
      get: {
        summary: 'List events',
        parameters: [
          { in: 'query', name: 'taskId', schema: { type: 'integer' }, description: 'Filter by task id' },
          { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 }, description: 'Maximum rows' },
        ],
        responses: {
          '200': {
            description: 'Event list',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Event' } },
                example: [
                  {
                    id: 101,
                    taskId: 12,
                    agentName: 'system',
                    eventType: 'status_change',
                    payload: 'Status: todo → in_progress',
                    createdAt: '2026-02-18T04:00:00.000Z',
                    taskTitle: 'Draft release notes',
                  },
                ],
              },
            },
          },
        },
      },
      post: {
        summary: 'Create event',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['eventType'],
                properties: {
                  taskId: { type: 'integer', nullable: true },
                  agentName: { type: 'string', nullable: true },
                  eventType: { type: 'string' },
                  payload: { type: 'string' },
                },
              },
              example: { taskId: 12, agentName: 'system', eventType: 'updated', payload: '{"priority":"High"}' },
            },
          },
        },
        responses: {
          '201': { description: 'Created event', content: { 'application/json': { schema: { $ref: '#/components/schemas/Event' } } } },
          '400': { description: 'Validation error' },
        },
      },
    },
    '/api/heartbeats': {
      get: {
        summary: 'Get latest heartbeat per source',
        responses: {
          '200': {
            description: 'Heartbeat list',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Heartbeat' } },
                example: [{ id: 24, source: 'gateway', status: 'ok', payload: '{"latencyMs":72}', checkedAt: '2026-02-18T04:05:00.000Z' }],
              },
            },
          },
        },
      },
    },
    '/api/gateway': {
      get: {
        summary: 'Proxy gateway root endpoint',
        responses: {
          '200': { description: 'Gateway response', content: { 'application/json': { example: { health: 'ok', uptime: 12345 } } } },
          '502': { description: 'Gateway unreachable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/gateway/status': {
      get: {
        summary: 'Proxy gateway status endpoint',
        responses: {
          '200': { description: 'Gateway status', content: { 'application/json': { example: { status: 'ok', model: 'claude-sonnet-4-5' } } } },
          '502': { description: 'Gateway unreachable' },
        },
      },
    },
    '/api/telegram': {
      post: {
        summary: 'Send a Telegram message using configured bot credentials',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
              example: { text: 'Mission Control test ping' },
            },
          },
        },
        responses: {
          '200': { description: 'Message accepted', content: { 'application/json': { example: { ok: true } } } },
          '400': { description: 'Validation error' },
        },
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(spec);
}
