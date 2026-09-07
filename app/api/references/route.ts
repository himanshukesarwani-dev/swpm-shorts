import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase
    .from('reference_videos')
    .select('id, creator, title, views, multiple')
    .order('multiple', { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data);
}
