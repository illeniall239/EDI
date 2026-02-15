const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => ({}));

    const resp = await fetch(`${BACKEND_URL}/api/initialize-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    const headers: HeadersInit = {
      ...corsHeaders(req),
      'Content-Type': resp.headers.get('content-type') || 'application/json',
    };
    return new Response(text, { status: resp.status, headers });
  } catch (error: unknown) {
    const headers: HeadersInit = { ...corsHeaders(req), 'Content-Type': 'application/json' };
    return new Response(
      JSON.stringify({ detail: error instanceof Error ? error.message : 'Proxy error' }),
      { status: 500, headers }
    );
  }
}


