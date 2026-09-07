import { MEDIA_BUCKET, supabase } from './supabase';

const CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

/** Uploads to the `media` bucket and returns the public URL. */
export async function uploadFile(buffer: Buffer, path: string): Promise<string> {
  const contentType = CONTENT_TYPES[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream';

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, buffer, { contentType, upsert: true });

  if (error) throw new Error(`Upload of ${path} failed: ${error.message}`);

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
