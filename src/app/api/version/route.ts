export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { revision: process.env.NEXT_PUBLIC_APP_REVISION },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
