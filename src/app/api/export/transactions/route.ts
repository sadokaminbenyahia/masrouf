// Propriétaire : agent A — export CSV des transactions (GET /api/export/transactions?from=&to=)
import type { AppErrorCode } from '@/domain/result';
import { exportQuerySchema } from '@/lib/schemas/transactions';
import { getCurrentUserId } from '@/server/auth/session';
import { today } from '@/server/clock';
import { exportTransactionsCsv } from '@/server/services/transactions.service';

export const dynamic = 'force-dynamic';

const STATUS: Record<AppErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

function jsonError(code: AppErrorCode, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status: STATUS[code], headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request: Request): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return jsonError('UNAUTHORIZED', 'Veuillez vous connecter.');

  const params = new URL(request.url).searchParams;
  const param = (name: string) => {
    const v = params.get(name);
    return v === null || v === '' ? undefined : v;
  };
  const parsed = exportQuerySchema.safeParse({ from: param('from'), to: param('to') });
  if (!parsed.success) return jsonError('VALIDATION', 'Période invalide (AAAA-MM-JJ).');

  try {
    const result = await exportTransactionsCsv(userId, parsed.data);
    if (!result.ok) return jsonError(result.error.code, result.error.message);
    return new Response(result.value, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="masrouf-transactions-${today()}.csv"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    console.error('[export] erreur inattendue', e);
    return jsonError('INTERNAL', 'Une erreur inattendue est survenue.');
  }
}
