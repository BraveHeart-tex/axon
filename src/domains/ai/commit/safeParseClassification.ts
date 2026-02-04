import { CommitType } from './types.js';

export interface CommitClassification {
  type: CommitType;
  scope?: string;
  intent: string;
}

export const safeParseClassification = (raw: string): CommitClassification => {
  try {
    const jsonText = extractJson(raw);
    const parsed = JSON.parse(jsonText);

    if (!parsed.type || !parsed.intent || typeof parsed.intent !== 'string') {
      throw new Error('Invalid classification payload');
    }

    return {
      type: parsed.type,
      scope: parsed.scope ?? undefined,
      intent: parsed.intent.slice(0, 80),
    };
  } catch {
    throw new Error(`Failed to parse commit classification:\n${raw}`);
  }
};

const extractJson = (raw: string): string => {
  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return raw.slice(start, end + 1).trim();
  }

  throw new Error(`No JSON found in AI response:\n${raw}`);
};
