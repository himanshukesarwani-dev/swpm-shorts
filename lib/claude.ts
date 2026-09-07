import Anthropic from '@anthropic-ai/sdk';
import { extractStructurePrompt } from '../prompts/extract-structure';
import { researchPrompt } from '../prompts/research';
import { writeScriptPrompt } from '../prompts/write-script';
import type persona from '../persona.json';

export type Persona = typeof persona;

export type Source = {
  title: string;
  url: string;
};

export type Fact = {
  claim: string;
  source: Source;
};

export type Research = {
  facts: Fact[];
};

export type Beat = {
  name: string;
  purpose: string;
  wordBudget: number;
};

export type Structure = {
  beats: Beat[];
  totalWordBudget: number;
  rules: string[];
};

const MODEL = process.env.CLAUDE_MODEL ?? 'claude-haiku-4-5-20251001';

// The dynamic-filtering web search tool runs code execution under the hood, so only
// models that support programmatic tool calling accept it. Haiku 4.5 rejects it with a
// 400 and needs the basic variant instead.
const SUPPORTS_DYNAMIC_SEARCH = ['claude-opus-', 'claude-sonnet-5', 'claude-sonnet-4-6'];

function webSearchTool(): Anthropic.ToolUnion {
  const dynamic = SUPPORTS_DYNAMIC_SEARCH.some((prefix) => MODEL.startsWith(prefix));
  return dynamic
    ? { type: 'web_search_20260209', name: 'web_search', max_uses: 6 }
    : { type: 'web_search_20250305', name: 'web_search', max_uses: 6 };
}

let client: Anthropic | undefined;

function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Missing env var ANTHROPIC_API_KEY');
    client = new Anthropic({ apiKey });
  }
  return client;
}

/** All the text blocks of a response, joined. Server tool blocks are skipped. */
function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/** Models wrap JSON in markdown fences often enough to be worth handling every time. */
function parseJson<T>(text: string | undefined, what: string): T {
  const raw = (text ?? '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.search(/[[{]/);
  const end = Math.max(body.lastIndexOf(']'), body.lastIndexOf('}'));

  if (start === -1 || end === -1) throw new Error(`${what}: no JSON in the response`);

  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    throw new Error(`${what}: response was not valid JSON`);
  }
}

type RawFact = { claim?: unknown; sourceTitle?: unknown; sourceUrl?: unknown };

export async function research(topic: string): Promise<Research> {
  const message = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 8192,
    tools: [webSearchTool()],
    messages: [{ role: 'user', content: researchPrompt(topic) }],
  });

  const parsed = parseJson<{ facts?: RawFact[] }>(textOf(message), 'research');

  // Server tool errors arrive as a 200 with an error object where the list would be.
  const searched: Source[] = message.content
    .filter(
      (block): block is Anthropic.WebSearchToolResultBlock =>
        block.type === 'web_search_tool_result'
    )
    .flatMap((block) => (Array.isArray(block.content) ? block.content : []))
    .map((result) => ({ title: result.title, url: result.url }));

  const facts: Fact[] = (parsed.facts ?? [])
    .filter((fact): fact is RawFact & { claim: string } => typeof fact.claim === 'string')
    .map((fact, index) => {
      const url = typeof fact.sourceUrl === 'string' ? fact.sourceUrl : '';
      const title = typeof fact.sourceTitle === 'string' ? fact.sourceTitle : '';
      // A model-invented url is worse than no url, so fall back to what search returned.
      const found = searched[index];
      const usable = url.startsWith('http');

      return {
        claim: fact.claim,
        source: {
          title: (usable ? title : found?.title) || 'Source',
          url: usable ? url : (found?.url ?? ''),
        },
      };
    });

  if (facts.length === 0) throw new Error('research: no facts came back');
  return { facts };
}

export async function extractStructure(transcript: string): Promise<Structure> {
  const message = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [{ role: 'user', content: extractStructurePrompt(transcript) }],
  });

  const structure = parseJson<Structure>(textOf(message), 'extractStructure');
  if (!Array.isArray(structure.beats) || structure.beats.length === 0) {
    throw new Error('extractStructure: no beats came back');
  }
  return {
    beats: structure.beats,
    totalWordBudget: structure.totalWordBudget,
    rules: Array.isArray(structure.rules) ? structure.rules : [],
  };
}

function countWords(script: string): number {
  return script.split(/\s+/).filter(Boolean).length;
}

async function generateScript(
  facts: Research,
  structure: Structure,
  persona: Persona,
  overBy: number
): Promise<string> {
  const message = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: writeScriptPrompt(facts, structure, persona, overBy) }],
  });

  const script = textOf(message)
    // Spoken words only: markdown that slips through would be read aloud.
    .replace(/```[a-z]*\n?|```/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*|__|[*`]/g, '')
    // The persona forbids both outright, so enforce rather than hope.
    .replace(/[—–]/g, ',')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .trim();

  if (!script) throw new Error('writeScript: empty script');
  return script;
}

export async function writeScript(
  facts: Research,
  structure: Structure,
  persona: Persona
): Promise<string> {
  const limit = structure.totalWordBudget;
  const first = await generateScript(facts, structure, persona, 0);
  if (countWords(first) <= limit) return first;

  // One retry with the overage quoted back; keep whichever came in shorter.
  const second = await generateScript(facts, structure, persona, countWords(first) - limit);
  return countWords(second) < countWords(first) ? second : first;
}
