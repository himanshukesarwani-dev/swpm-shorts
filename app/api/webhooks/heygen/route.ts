import { createHmac, timingSafeEqual } from 'node:crypto';
import { uploadFile } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

// HeyGen signs the raw body with HMAC-SHA256 and rejects replays older than this.
const MAX_SKEW_SECONDS = 300;

/** Returns null when the delivery is genuine, or the reason it is not. */
function verifySignature(request: Request, rawBody: string): string | null {
  const secret = process.env.HEYGEN_WEBHOOK_SECRET;
  if (!secret) return 'HEYGEN_WEBHOOK_SECRET is not set';

  const signature = request.headers.get('heygen-signature');
  const timestamp = request.headers.get('heygen-timestamp');
  if (!signature || !timestamp) return 'Missing signature headers';

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_SKEW_SECONDS) return 'Signature timestamp is stale';

  // Computed over the raw bytes: re-serialising the JSON would change them.
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const given = Buffer.from(signature, 'hex');
  const want = Buffer.from(expected, 'hex');

  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return 'Signature does not match';
  }
  return null;
}

// HeyGen's avatar video events. Anything else is acknowledged and ignored.
type HeyGenWebhook = {
  event_type?: string;
  event_data?: {
    video_id?: string;
    url?: string;
    msg?: string;
    message?: string;
    error?: string;
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();

  const invalid = verifySignature(request, rawBody);
  if (invalid) return Response.json({ error: invalid }, { status: 401 });

  let body: HeyGenWebhook | null = null;
  try {
    body = JSON.parse(rawBody) as HeyGenWebhook;
  } catch {
    return Response.json({ error: 'Body is not valid JSON' }, { status: 400 });
  }

  const eventType = body?.event_type ?? '';
  const videoId = body?.event_data?.video_id ?? '';

  if (!videoId) {
    return Response.json({ error: 'event_data.video_id is required' }, { status: 400 });
  }

  const { data: job, error: lookupError } = await supabase
    .from('jobs')
    .select('id')
    .eq('heygen_job_id', videoId)
    .single();

  if (lookupError || !job) {
    return Response.json({ error: 'No job for that video_id' }, { status: 404 });
  }

  if (eventType === 'avatar_video.fail') {
    const reason =
      body?.event_data?.msg ?? body?.event_data?.message ?? body?.event_data?.error ?? 'unknown';
    await supabase
      .from('jobs')
      .update({ status: 'failed', error: `HeyGen render failed: ${reason}` })
      .eq('id', job.id);
    return Response.json({ ok: true, jobId: job.id });
  }

  if (eventType !== 'avatar_video.success') {
    // Not an event we act on. Acknowledge so HeyGen stops retrying.
    return Response.json({ ok: true, ignored: eventType });
  }

  const downloadUrl = body?.event_data?.url;
  if (!downloadUrl) {
    return Response.json({ error: 'event_data.url is required on success' }, { status: 400 });
  }

  try {
    // HeyGen's url is a short-lived pre-signed link, so the MP4 has to be copied
    // into our own storage before it expires.
    const download = await fetch(downloadUrl);
    if (!download.ok) throw new Error(`Download failed: HTTP ${download.status}`);

    const mp4 = Buffer.from(await download.arrayBuffer());
    const videoUrl = await uploadFile(mp4, `video/${videoId}.mp4`);

    await supabase
      .from('jobs')
      .update({ video_url: videoUrl, status: 'ready' })
      .eq('id', job.id);

    return Response.json({ ok: true, jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from('jobs').update({ status: 'failed', error: message }).eq('id', job.id);
    return Response.json({ error: message, jobId: job.id }, { status: 500 });
  }
}
