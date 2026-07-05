import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const db = sbAdmin();
  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  try {
     
    const [ratingsRes, recentRes] = await Promise.all([
      // All ratings in last 30 days
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any)
        .from('ratings')
        .select('score, comment, rated_email, rater_email, created_at')
        .gte('created_at', since30d)
        .order('created_at', { ascending: false }),
      // Recent 1-star ratings (most recent 20)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any)
        .from('ratings')
        .select('score, comment, rated_email, rater_email, created_at')
        .eq('score', 1)
        .gte('created_at', since30d)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const allRatings: { score: number; comment?: string; rated_email: string; rater_email: string; created_at: string }[] =
      ratingsRes.data ?? [];

    // ── Aggregate by rated_email ─────────────────────────────────────────────
    const map = new Map<string, { sum: number; count: number; ones: number }>();
    for (const r of allRatings) {
      if (!map.has(r.rated_email)) map.set(r.rated_email, { sum: 0, count: 0, ones: 0 });
      const e = map.get(r.rated_email)!;
      e.sum += r.score;
      e.count++;
      if (r.score === 1) e.ones++;
    }

    // Bottom 10 by avg rating (minimum 3 ratings to qualify)
    const bottom10 = Array.from(map.entries())
      .filter(([, v]) => v.count >= 3)
      .map(([email, v]) => ({
        email,
        avg: parseFloat((v.sum / v.count).toFixed(2)),
        count: v.count,
        ones: v.ones,
      }))
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 10);

    // Top 10 by avg rating
    const top10 = Array.from(map.entries())
      .filter(([, v]) => v.count >= 3)
      .map(([email, v]) => ({
        email,
        avg: parseFloat((v.sum / v.count).toFixed(2)),
        count: v.count,
        ones: v.ones,
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10);

    // ── Total stats ──────────────────────────────────────────────────────────
    const totalRatings = allRatings.length;
    const oneStarCount = allRatings.filter(r => r.score === 1).length;
    const avgOverall = totalRatings > 0
      ? parseFloat((allRatings.reduce((s, r) => s + r.score, 0) / totalRatings).toFixed(2))
      : 0;

    // ── Keyword extraction from comments ─────────────────────────────────────
    const badComments = allRatings
      .filter(r => r.score <= 2 && r.comment)
      .map(r => r.comment!.toLowerCase());

    const stopWords = new Set(['de', 'la', 'el', 'en', 'y', 'a', 'no', 'se', 'que', 'es', 'por', 'con', 'lo', 'los', 'las', 'un', 'una', 'del', 'al', 'me', 'le', 'muy', 'fue', 'mi', 'su', 'te']);
    const wordFreq = new Map<string, number>();
    for (const comment of badComments) {
      const words = comment.replace(/[^\w\sáéíóúüñ]/g, ' ').split(/\s+/);
      for (const w of words) {
        if (w.length > 3 && !stopWords.has(w)) {
          wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
        }
      }
    }
    const topKeywords = Array.from(wordFreq.entries())
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([word, count]) => ({ word, count }));

    return NextResponse.json({
      bottom10,
      top10,
      recent_ones: recentRes.data ?? [],
      stats: { totalRatings, oneStarCount, avgOverall },
      topKeywords,
    });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
