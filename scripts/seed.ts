// Seed reference_videos with a handful of Varun Mayya outliers so the rest of the
// shell can be built before Loop A exists. Transcripts are placeholders.
import { supabase } from '../lib/supabase';
import structure from '../structure-tech-reveal.json';

const PLACEHOLDER_TRANSCRIPT = 'PLACEHOLDER TRANSCRIPT — replace with the real one.';

const rows = [
  {
    youtube_id: 'placeholder-drone-swarm',
    title: "China's drone swarm controlled by hand",
    views: 11_200_000,
    multiple: 8,
  },
  {
    youtube_id: 'placeholder-chinese-console',
    title: 'Chinese console running PS5, Xbox and Switch',
    views: 5_200_000,
    multiple: 3.7,
  },
  {
    youtube_id: 'placeholder-ai-traffic-cop',
    title: 'Helmet turned into an AI traffic cop',
    views: 2_400_000,
    multiple: 1.7,
  },
  {
    youtube_id: 'placeholder-nvidia-digits',
    title: 'Nvidia DIGITS changed computing',
    views: 1_690_000,
    multiple: 1.2,
  },
  {
    youtube_id: 'placeholder-ai-avengers',
    title: "Zuckerberg's AI Avengers",
    views: 1_400_000,
    multiple: 1,
  },
].map((row) => ({
  ...row,
  creator: 'Varun Mayya',
  transcript: PLACEHOLDER_TRANSCRIPT,
  // The real skeleton, extracted from all five of these shorts together. Seeding it
  // means /api/generate never falls back to extracting from the placeholder above.
  structure_json: structure,
}));

async function main() {
  // Keyed on youtube_id so re-seeding refreshes rather than duplicates.
  const { data, error } = await supabase
    .from('reference_videos')
    .upsert(rows, { onConflict: 'youtube_id' })
    .select('id, title');

  if (error) throw error;
  console.log(`Seeded ${data.length} reference videos:`);
  for (const row of data) console.log(`  ${row.id}  ${row.title}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
