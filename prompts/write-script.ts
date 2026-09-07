import type { Persona, Research, Structure } from '../lib/claude';

export function writeScriptPrompt(
  facts: Research,
  structure: Structure,
  persona: Persona,
  overBy = 0
): string {
  const beats = structure.beats
    .map((beat, index) => `${index + 1}. ${beat.name} (${beat.wordBudget} words) — ${beat.purpose}`)
    .join('\n');

  const factLines = facts.facts.map((fact) => `- ${fact.claim}`).join('\n');

  return `Write the spoken script for a short video.

STRUCTURE, follow these beats in this order. The word budget on each beat is a hard
limit, not a suggestion. Going over is a failure, not a style choice:
${beats}

Total word budget: ${structure.totalWordBudget} words. The finished script must come in
at or under this. Aim for ${Math.round(structure.totalWordBudget * 0.95)}.
Before you answer, count the words. If you are over, cut until you are under. Cut whole
sentences rather than trimming every sentence into something clipped.${
    overBy
      ? `

Your previous attempt ran ${overBy} words over the limit. Write a shorter one.`
      : ''
  }

RULES, all of them:
${structure.rules.map((rule) => `- ${rule}`).join('\n')}

FACTS, use only these. Do not add numbers, claims or examples of your own:
${factLines}

SPEAKER AND AUDIENCE:
${JSON.stringify(persona, null, 2)}

Output only the words that get spoken. No beat labels, no headings, no stage directions, no
markdown, no emojis, no em dashes, no quotation marks around the script.`;
}
