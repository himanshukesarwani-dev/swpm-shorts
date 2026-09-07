import { research, extractStructure, writeScript } from '@/lib/claude';
import type { Structure } from '@/lib/claude';
import { supabase } from '@/lib/supabase';
import persona from '@/persona.json';

// Three Claude calls, roughly 40 seconds. Confirm the Vercel plan allows this.
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const topic = typeof body?.topic === 'string' ? body.topic.trim() : '';
  const referenceVideoId =
    typeof body?.referenceVideoId === 'string' ? body.referenceVideoId : '';

  if (!topic || !referenceVideoId) {
    return Response.json(
      { error: 'topic and referenceVideoId are required' },
      { status: 400 }
    );
  }

  const { data: reference, error: referenceError } = await supabase
    .from('reference_videos')
    .select('id, transcript, structure_json')
    .eq('id', referenceVideoId)
    .single();

  if (referenceError || !reference) {
    return Response.json({ error: 'Reference video not found' }, { status: 404 });
  }

  const { data: job, error: insertError } = await supabase
    .from('jobs')
    .insert({ topic, reference_video_id: reference.id, status: 'generating' })
    .select()
    .single();

  if (insertError || !job) {
    return Response.json(
      { error: insertError?.message ?? 'Could not create job' },
      { status: 500 }
    );
  }

  try {
    // Independent of each other; the script needs both. A cached structure means
    // every short off this reference is built from the same skeleton.
    const cached: Structure | null = reference.structure_json;
    const [facts, structure] = await Promise.all([
      research(topic),
      cached ?? extractStructure(reference.transcript),
    ]);

    if (!cached) {
      // Best effort: a job should not fail because the cache write did.
      await supabase
        .from('reference_videos')
        .update({ structure_json: structure })
        .eq('id', reference.id);
    }
    const script = await writeScript(facts, structure, persona);

    const { data: updated, error: updateError } = await supabase
      .from('jobs')
      .update({ facts_json: facts, script, status: 'script_ready' })
      .eq('id', job.id)
      .select()
      .single();

    if (updateError) throw updateError;
    return Response.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from('jobs')
      .update({ status: 'failed', error: message })
      .eq('id', job.id);
    return Response.json({ error: message, jobId: job.id }, { status: 500 });
  }
}
