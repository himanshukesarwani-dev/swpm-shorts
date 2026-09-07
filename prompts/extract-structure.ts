export function extractStructurePrompt(transcript: string): string {
  return `Below is the transcript of a short video that heavily outperformed its creator's
average. Work out the skeleton that made it work, so a different writer can reuse it for a
completely different topic.

Return the ordered beats. For each beat give a short name, the function it performs on the
viewer, and a word budget taken from how many words that section actually uses. Also return
the total word budget and a list of rules the script obeys, covering pacing, sentence
length, how it opens, how it closes, and how information is released.

Extract structure and pacing only. Never copy any phrasing, sentence or example from the
transcript. If a beat is specific to this topic, describe its function in general terms
instead.

Reply with JSON only, no commentary before or after, in this shape:
{"beats":[{"name":"...","purpose":"...","wordBudget":15}],"totalWordBudget":150,"rules":["..."]}

TRANSCRIPT:
${transcript}`;
}
