import { failure } from '@/lib/api-response';

export function checkAgentToken(request: Request) {
  const expected = process.env.PRINT_AGENT_TOKEN;
  if (!expected) {
    return failure('PRINT_AGENT_NOT_CONFIGURED', 'PRINT_AGENT_TOKEN no está configurado en el servidor', 500);
  }

  const provided = request.headers.get('x-agent-token');
  if (provided !== expected) {
    return failure('UNAUTHORIZED', 'Token de agente inválido', 401);
  }

  return null;
}
