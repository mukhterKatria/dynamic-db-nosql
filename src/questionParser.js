const OpenAI = require('openai');

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in model response.');
  return JSON.parse(match[0]);
}

async function parseQuestionWithLLM({ question, collection, fields }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const systemPrompt = `You are a MongoDB query planner.\nReturn only JSON with keys: filters (array), projection (array), sort (array), limit (number).\nFilters item format: {"field":"name","op":"eq|ne|gt|gte|lt|lte|in|nin|regex|exists","value":any}.\nSort item format: {"field":"name","dir":"asc|desc"}.\nUse only field names from the provided field list. If unsure, leave arrays empty.`;

  const userPrompt = `Collection: ${collection}\nAvailable fields: ${fields.join(', ') || 'unknown'}\nQuestion: ${question}`;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0
  });

  return extractJson(response.choices[0]?.message?.content || '{}');
}

function parseQuestionHeuristic({ question }) {
  const q = question.toLowerCase();
  const result = {
    filters: [],
    projection: [],
    sort: [],
    limit: 50
  };

  const limitMatch = q.match(/(?:top|limit|first)\s+(\d+)/);
  if (limitMatch) result.limit = Number(limitMatch[1]);

  if (/(latest|newest|recent)/.test(q)) {
    result.sort.push({ field: 'createdAt', dir: 'desc' });
  }

  const eqMatch = q.match(/where\s+([a-zA-Z0-9_.]+)\s*(=|is)\s*['\"]?([\w\-:. ]+)['\"]?/);
  if (eqMatch) {
    result.filters.push({ field: eqMatch[1], op: 'eq', value: eqMatch[3].trim() });
  }

  const gtMatch = q.match(/([a-zA-Z0-9_.]+)\s*(>|greater than|above)\s*(\d+(?:\.\d+)?)/);
  if (gtMatch) {
    result.filters.push({ field: gtMatch[1], op: 'gt', value: Number(gtMatch[3]) });
  }

  return result;
}

async function buildQueryFromQuestion({ question, collection, fields = [] }) {
  try {
    const llmResult = await parseQuestionWithLLM({ question, collection, fields });
    if (llmResult) return { ...llmResult, source: 'llm' };
  } catch (error) {
    // Fallback to deterministic heuristic parser.
  }

  return {
    ...parseQuestionHeuristic({ question, fields }),
    source: 'heuristic'
  };
}

module.exports = {
  buildQueryFromQuestion,
  parseQuestionHeuristic,
  extractJson
};
