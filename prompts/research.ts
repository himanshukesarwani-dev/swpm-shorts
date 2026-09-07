export function researchPrompt(topic: string): string {
  return `Research this topic using web search: ${topic}

Return 5 to 8 short factual claims. Between them they must cover:
- what it is
- who made it
- what it does
- key numbers, such as price, dates, benchmarks, scale or adoption
- why it matters

Rules:
- One fact per claim, stated in a single sentence.
- Prefer specific numbers and dates over adjectives.
- Only claims you found in search results. If something is unconfirmed, leave it out.
- Every claim needs the title and url of the page it came from.

Reply with JSON only, in this shape:
{"facts":[{"claim":"...","sourceTitle":"...","sourceUrl":"https://..."}]}`;
}
