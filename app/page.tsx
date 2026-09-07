'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Research } from '@/lib/claude';

type Reference = {
  id: string;
  creator: string;
  title: string;
  views: number;
  multiple: number;
};

type Job = {
  id: string;
  topic: string;
  facts_json: Research | null;
  script: string | null;
  video_url: string | null;
  status: string;
  error: string | null;
};

const POLL_INTERVAL_MS = 5000;
const IN_FLIGHT = ['approved', 'audio', 'rendering'];

function formatViews(views: number) {
  const n = Number(views);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function describe(reference: Reference) {
  return `${reference.creator} — ${reference.title} — ${formatViews(reference.views)} — ${Number(
    reference.multiple
  )}x`;
}

export default function Home() {
  const [references, setReferences] = useState<Reference[]>([]);
  const [topic, setTopic] = useState('');
  const [referenceVideoId, setReferenceVideoId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [script, setScript] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/references')
      .then((response) => response.json())
      .then(setReferences)
      .catch(() => setError('Could not load reference videos'));
  }, []);

  // The render takes minutes and finishes at the webhook, so the page polls for it.
  useEffect(() => {
    if (!job || !IN_FLIGHT.includes(job.status)) return;

    const timer = setInterval(async () => {
      const response = await fetch(`/api/jobs/${job.id}`);
      if (response.ok) setJob(await response.json());
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [job]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setJob(null);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, referenceVideoId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Generate failed');
      setJob(data);
      setScript(data.script ?? '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setGenerating(false);
    }
  }, [topic, referenceVideoId]);

  const approve = useCallback(async () => {
    if (!job) return;
    setApproving(true);
    setError(null);
    try {
      const response = await fetch('/api/produce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, script }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Produce failed');
      // Kicks off the polling effect.
      setJob({ ...job, script, status: 'rendering' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setApproving(false);
    }
  }, [job, script]);

  const readyToGenerate = topic.trim() !== '' && referenceVideoId !== '' && !generating;
  const producing = job !== null && IN_FLIGHT.includes(job.status);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Shorts Generator</h1>

      <div className="flex flex-col gap-2">
        <label htmlFor="topic">Topic</label>
        <input
          id="topic"
          className="border p-2"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="GPT Astra"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="reference">Reference structure</label>
        <select
          id="reference"
          className="border p-2"
          value={referenceVideoId}
          onChange={(event) => setReferenceVideoId(event.target.value)}
        >
          <option value="">Pick a reference video</option>
          {references.map((reference) => (
            <option key={reference.id} value={reference.id}>
              {describe(reference)}
            </option>
          ))}
        </select>
      </div>

      <button
        className="border p-2 disabled:opacity-50"
        onClick={generate}
        disabled={!readyToGenerate}
      >
        {generating ? 'Researching and writing…' : 'Generate'}
      </button>

      {error && <p className="border border-red-500 p-2 text-red-600">{error}</p>}

      {job?.error && (
        <p className="border border-red-500 p-2 text-red-600">Job failed: {job.error}</p>
      )}

      {job?.script && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="script">Script</label>
            <textarea
              id="script"
              className="border p-2 font-mono"
              rows={18}
              value={script}
              onChange={(event) => setScript(event.target.value)}
              disabled={producing}
            />
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="font-semibold">Facts used</h2>
            <ul className="flex flex-col gap-2">
              {job.facts_json?.facts.map((fact, index) => (
                <li key={index}>
                  <p>{fact.claim}</p>
                  <a
                    className="text-sm underline"
                    href={fact.source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {fact.source.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <button
            className="border p-2 disabled:opacity-50"
            onClick={approve}
            disabled={approving || producing || job.status === 'ready'}
          >
            {approving ? 'Sending…' : 'Approve and produce'}
          </button>
        </div>
      )}

      {job && job.status !== 'script_ready' && (
        <p>
          Status: {job.status}
          {producing && ' — this takes a few minutes'}
        </p>
      )}

      {job?.status === 'ready' && job.video_url && (
        <div className="flex flex-col gap-2">
          <video className="w-full" src={job.video_url} controls />
          <a className="underline" href={job.video_url} download>
            Download MP4
          </a>
        </div>
      )}
    </main>
  );
}
