import { renderAvatar, textToSpeech } from '@/lib/produce';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const jobId = typeof body?.jobId === 'string' ? body.jobId : '';
  const script = typeof body?.script === 'string' ? body.script.trim() : '';

  if (!jobId || !script) {
    return Response.json({ error: 'jobId and script are required' }, { status: 400 });
  }

  // The approval gate: the script the user actually read is the one we produce.
  const { data: job, error: approveError } = await supabase
    .from('jobs')
    .update({ script, status: 'approved' })
    .eq('id', jobId)
    .select()
    .single();

  if (approveError || !job) {
    return Response.json({ error: 'Job not found' }, { status: 404 });
  }

  try {
    const audioUrl = await textToSpeech(script);
    await supabase
      .from('jobs')
      .update({ audio_url: audioUrl, status: 'audio' })
      .eq('id', job.id);

    // Returns a job id, not a video. The MP4 arrives at the webhook minutes later.
    const heygenJobId = await renderAvatar(audioUrl);
    await supabase
      .from('jobs')
      .update({ heygen_job_id: heygenJobId, status: 'rendering' })
      .eq('id', job.id);

    return Response.json({ jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from('jobs')
      .update({ status: 'failed', error: message })
      .eq('id', job.id);
    return Response.json({ error: message, jobId: job.id }, { status: 500 });
  }
}
