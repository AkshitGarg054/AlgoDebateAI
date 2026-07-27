/**
 * Robust JSON repair and safe parser utility.
 * Prevents WebSocket and BullMQ worker pipeline crashes caused by truncated or malformed LLM JSON output.
 */

export function safeParseJSON(text, fallbackObj = {}) {
  if (!text || typeof text !== 'string') {
    return fallbackObj;
  }

  let cleaned = text.trim();

  // Strip markdown code fences if present (e.g. ```json ... ```)
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
  }

  // 1. Direct JSON parse
  try {
    return JSON.parse(cleaned);
  } catch (err1) {
    // 2. Attempt substring extraction between first '{' and last '}'
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch (err2) {
        // Continue to relaxed repair
      }
    }

    // 3. Relaxed Repair: fix unclosed strings and missing closing braces
    try {
      let repaired = cleaned;
      if (firstBrace !== -1) {
        repaired = repaired.slice(firstBrace);
      } else {
        repaired = '{' + repaired;
      }

      // If there's an unclosed quote, close it
      const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        repaired += '"';
      }

      // Close missing braces
      const openBraces = (repaired.match(/\{/g) || []).length;
      const closeBraces = (repaired.match(/\}/g) || []).length;
      for (let i = 0; i < openBraces - closeBraces; i++) {
        repaired += '}';
      }

      return JSON.parse(repaired);
    } catch (err3) {
      // 4. Fallback Regex Extraction for known schema fields
      console.warn('[jsonRepair] JSON parse failed after repair attempts. Extracting fields via regex fallback.');
      const result = { ...fallbackObj };

      // Extract 'code' or 'finalCode'
      const codeMatch = text.match(/"(?:code|finalCode)"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"|"\s*\}|$)/);
      if (codeMatch && codeMatch[1]) {
        if (result.code !== undefined) result.code = codeMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
        if (result.finalCode !== undefined) result.finalCode = codeMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      }

      // Extract 'approved'
      const approvedMatch = text.match(/"approved"\s*:\s*(true|false)/i);
      if (approvedMatch) {
        result.approved = approvedMatch[1].toLowerCase() === 'true';
      }

      // Extract 'reasoning' or 'criticism' or 'explanation'
      const reasoningMatch = text.match(/"(?:reasoning|criticism|explanation)"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"|"\s*\}|$)/);
      if (reasoningMatch && reasoningMatch[1]) {
        const cleanedStr = reasoningMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
        if (result.reasoning !== undefined) result.reasoning = cleanedStr;
        if (result.criticism !== undefined) result.criticism = cleanedStr;
        if (result.explanation !== undefined) result.explanation = cleanedStr;
      }

      return result;
    }
  }
}
