import { uploadFile } from './storage';

const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const HEYGEN_URL = 'https://api.heygen.com/v3/videos';

type HeyGenCreateResponse = {
  data?: { video_id?: string };
  error?: { message?: string } | null;
  message?: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

/** Returns the public URL of the generated MP3, already uploaded to storage. */
export async function textToSpeech(script: string): Promise<string> {
  const voiceId = requireEnv('ELEVENLABS_VOICE_ID');

  const response = await fetch(`${ELEVENLABS_URL}/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'xi-api-key': requireEnv('ELEVENLABS_API_KEY'),
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({ text: script, model_id: 'eleven_multilingual_v2' }),
  });

  if (!response.ok) {
    // The body carries the actual reason: quota, bad voice id, invalid key.
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`ElevenLabs ${response.status}: ${detail}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.byteLength === 0) throw new Error('ElevenLabs returned an empty audio file');

  return uploadFile(audio, `audio/${crypto.randomUUID()}.mp3`);
}

/**
 * Submits the render and returns the HeyGen video id. The MP4 arrives later, via the
 * webhook — nothing here waits for it.
 */
export async function renderAvatar(audioUrl: string): Promise<string> {
  const response = await fetch(HEYGEN_URL, {
    method: 'POST',
    headers: {
      'X-Api-Key': requireEnv('HEYGEN_API_KEY'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'avatar',
      avatar_id: requireEnv('HEYGEN_AVATAR_ID'),
      audio_url: audioUrl,
      aspect_ratio: '9:16',
      resolution: '1080p',
    }),
  });

  const body = (await response.json().catch(() => null)) as HeyGenCreateResponse | null;

  if (!response.ok) {
    const detail = body?.error?.message ?? body?.message ?? response.statusText;
    throw new Error(`HeyGen ${response.status}: ${detail}`);
  }

  const videoId = body?.data?.video_id;
  if (!videoId) throw new Error('HeyGen accepted the request but returned no video_id');

  return videoId;
}
