import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { cleanCodeString, cleanMarkdownText } from '../utils/parser.js';
import { safeParseJSON } from '../utils/jsonRepair.js';

// Reconstruct __dirname for ES Modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environmental variables
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

/**
 * Refines the final code solution and provides polished documentation.
 * @param {string} problemDescription - The original coding task description.
 * @param {string} finalDraftCode - The approved C++ code draft.
 * @param {Array<{round: number, code: string, criticism: string}>} [debateHistory=[]] - Full debate history of Coder/Critic.
 * @returns {Promise<{finalCode: string, explanation: string, timeComplexity: string, spaceComplexity: string}>}
 */
export async function refineCode(problemDescription, finalDraftCode, debateHistory = [], customSystemInstruction = null, language = 'cpp') {
  const normLang = (language || 'cpp').toLowerCase();
  const langUpper = (normLang === 'python' || normLang === 'py') ? 'Python' : ((normLang === 'java') ? 'Java' : 'C++');

  let prompt = `Problem Description:\n${problemDescription}\n\n`;
  prompt += `Approved ${langUpper} Code Draft:\n${finalDraftCode}\n\n`;

  if (debateHistory.length > 0) {
    prompt += `Debate History between Coder and Critic:\n`;
    debateHistory.forEach(h => {
      prompt += `Round ${h.round}:\n`;
      prompt += `- Code draft: ${h.code}\n`;
      prompt += `- Critic feedback: ${h.criticism}\n\n`;
    });
  }

  prompt += `Please polish the approved ${langUpper} code draft. Write the complete optimal solution strictly in ${langUpper} as selected by the user. Add clear, professional comments, format it nicely (MUST include proper line breaks and indentation), write a comprehensive markdown explanation, and state the exact Time and Space complexities.`;

  // System instruction defining the Refiner's role as a tech lead
  const systemInstruction = customSystemInstruction || `
You are a senior technical lead and software architect.
Your job is to polish, clean, and write clear comments for the approved ${langUpper} algorithm.
Write the complete optimal solution strictly in ${langUpper} (e.g. C++, Python, or Java) as selected by the user.

Universal Polish & Error Rectification Framework:
1. ERROR RECTIFICATION: Inspect the debate history. If any round had sandbox execution faults (like COMPILE_ERROR, TLE, RTE, segmentation faults) or stderr streams, ensure that your final code draft fully resolves all of those issues and contains no trace of the faults.
2. STRICT METHOD NAMING & SIGNATURE EXTRACTION:
   - Always use standard, exact LeetCode method names (e.g. 'isSameTree' instead of 'sameTree', 'invertTree', 'mergeTwoLists', 'hasCycle', 'nextPermutation', 'twoSum').
   - For Tree problems in Python: Use exact parameters and return type annotations, e.g., 'def isSameTree(self, p: Optional[TreeNode], q: Optional[TreeNode]) -> bool:' or 'def invertTree(self, root: Optional[TreeNode]) -> Optional[TreeNode]:'. Do NOT use generic 'nums: List[int]' for Tree, Linked List, or non-array questions!
3. COMMENTED DATA STRUCTURE DEFINITION AT TOP:
   - For Python Tree problems: Keep the commented definition at the top of Python output:
     # Definition for a binary tree node.
     # class TreeNode:
     #     def __init__(self, val=0, left=None, right=None):
     #         self.val = val
     #         self.left = left
     #         self.right = right
   - For Python Linked List problems:
     # Definition for singly-linked list.
     # class ListNode:
     #     def __init__(self, val=0, next=None):
     #         self.val = val
     #         self.next = next
   - For C++ / Java: Keep custom struct/class definitions inside commented blocks (e.g. /* struct TreeNode { ... }; */) at the top of the file so built-in LeetCode definitions work seamlessly.
4. CLEAN Solution CLASS FOCUS:
   - Make sure the active, uncommented code ONLY contains the 'class Solution { ... }' block (or 'class Solution:' in Python / 'class Solution' in Java).
   - Completely remove any helper 'main' function, stdin/stdout operations, or preprocessor blocks.
5. SYNTAX POLISHING & STRUCTURED SCHEMAS: Make sure the returned ${langUpper} code uses clean, standard formatting with correct newlines and indentation. Provide the final code, explanation, time complexity, and space complexity in strict JSON format.
6. FULL IMPLEMENTATION MANDATE: Ensure that 'finalCode' contains the COMPLETE, FULLY IMPLEMENTED ALGORITHMIC SOLUTION for ${langUpper}. Under NO circumstances return an empty stub, 'pass', 'return null;', or boilerplate shell.
  `.trim();

  const RefinerResponseSchema = {
    type: 'OBJECT',
    properties: {
      finalCode: {
        type: 'STRING',
        description: `The polished, clean, well-commented ${langUpper} code. You MUST include newlines (\\n) and proper indentation to format the code correctly. Do not wrap in markdown quotes.`
      },
      explanation: {
        type: 'STRING',
        description: 'A markdown explanation of the algorithm, why it is correct, and the optimization choices.'
      },
      timeComplexity: {
        type: 'STRING',
        description: 'The time complexity in Big O notation (e.g., O(N)).'
      },
      spaceComplexity: {
        type: 'STRING',
        description: 'The space complexity in Big O notation (e.g., O(1)).'
      }
    },
    required: ['finalCode', 'explanation', 'timeComplexity', 'spaceComplexity']
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: RefinerResponseSchema,
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    });

    const parsed = safeParseJSON(response.text);

    if (!parsed || !parsed.finalCode) {
      const codeMatch = response.text.match(/```(?:cpp|python|java|c\+\+|py)?\s*([\s\S]*?)```/i);
      const extractedCode = codeMatch ? codeMatch[1].trim() : cleanCodeString(response.text);
      
      return {
        finalCode: cleanCodeString(extractedCode || finalDraftCode),
        explanation: cleanMarkdownText(response.text.replace(/```[\s\S]*?```/g, '').trim()) || 'Raw LLM explanation produced by model.',
        timeComplexity: parsed?.timeComplexity || 'O(N)',
        spaceComplexity: parsed?.spaceComplexity || 'O(1)'
      };
    }

    return {
      finalCode: cleanCodeString(parsed.finalCode),
      explanation: cleanMarkdownText(parsed.explanation),
      timeComplexity: cleanMarkdownText(parsed.timeComplexity),
      spaceComplexity: cleanMarkdownText(parsed.spaceComplexity)
    };
  } catch (err) {
    console.error(`[RefinerAgent] Gemini API failure: ${err.message}`);
    throw new Error(`LLM Model Execution Failed: ${err.message}`);
  }
}
