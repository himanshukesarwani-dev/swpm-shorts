import { supabase } from '@/lib/supabase';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data, error } = await supabase.from('jobs').select().eq('id', id).single();

  if (error || !data) {
    return Response.json({ error: 'Job not found' }, { status: 404 });
  }
  return Response.json(data);
}
