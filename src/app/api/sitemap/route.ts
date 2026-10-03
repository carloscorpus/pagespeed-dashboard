import { NextResponse, type NextRequest } from 'next/server';
import { clientIp, rateLimit, tooMany } from '@/lib/rate-limit';
import { findSitemapUrls } from '@/lib/sitemap';
import { assertPublicUrl } from '@/lib/ssrf';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const limit = rateLimit('sitemap', clientIp(req));
  if (!limit.ok) return tooMany(limit.retryAfterSec);
  let site = (req.nextUrl.searchParams.get('site') || '').trim();
  if (!site) return NextResponse.json({ error: 'Falta el parámetro "site".' }, { status: 400 });
  if (!/^https?:\/\//i.test(site)) site = `https://${site}`;
  try {
    await assertPublicUrl(site);
    return NextResponse.json(await findSitemapUrls(site));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
