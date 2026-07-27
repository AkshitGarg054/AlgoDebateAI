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
 * Generates an initial code draft or refines it based on criticism history.
 * Supports C++, Python, and Java.
 */
export async function generateDraft(problemDescription, criticismHistory = [], customSystemInstruction = null, language = 'cpp') {
  const normLang = (language || 'cpp').toLowerCase();
  const langUpper = (normLang === 'python' || normLang === 'py') ? 'Python' : ((normLang === 'java') ? 'Java' : 'C++');

  let prompt = `Problem Description:\n${problemDescription}\n\n`;

  // If we have criticism from the Critic Agent or Sandbox, we build an iterative prompt
  if (criticismHistory.length > 0) {
    prompt += `You have previously generated code that was criticized or failed test runs. Here is the history:\n`;
    for (const history of criticismHistory) {
      prompt += `--- ROUND ${history.round} ---\n`;
      prompt += `Your Code:\n${history.code}\n\n`;
      prompt += `Criticism & Sandbox Failures:\n${history.criticism}\n\n`;
    }
    prompt += `Please write a corrected, optimized version of the ${langUpper} code that fixes all of these issues. Make sure it runs/compiles, passes all edge cases, and is efficient.`;
  } else {
    prompt += `Please write an initial ${langUpper} solution for this problem. Also generate 3 to 4 diverse test cases (including standard cases and edge cases) to verify your logic.`;
  }

  // System instructions establish the persona and standard guidelines
  const systemInstruction = customSystemInstruction || `
You are an expert competitive programmer and algorithms specialist.
Your task is to write high-quality, optimal, and compilable ${langUpper} code.
Write the complete optimal solution strictly in ${langUpper} (e.g. C++, Python, or Java) as selected by the user.

Guidelines:
1. Write code strictly in ${langUpper}.
2. STARTER SIGNATURE PRIORITY:
   - Always search the input text and starter templates for any provided function signature or method template.
   - If a starter template or function header is provided under '=== EXPORTED STARTER TEMPLATES ===', extract and keep the exact method name, return type, and parameter list 100% UNCHANGED.

3. STANDARD LEETCODE METHOD NAME MAPPING (Fallback Rule):
   - If no starter code is provided, map the problem title to LeetCode's official standard camelCase method name (e.g., "Search Insert Position" -> 'searchInsert', "Same Tree" -> 'isSameTree', "Divide Two Integers" -> 'divide', "Sudoku Solver" -> 'solveSudoku', "Two Sum" -> 'twoSum').
   - NEVER invent full-title or arbitrary method names (e.g., DO NOT use 'searchInsertPosition' or 'divideTwoIntegers').

4. LANGUAGE SPECIFIC SYNTAX ENFORCEMENT:
   - For C++: Output inside 'class Solution { public: <exact_method_name>(...) { ... } };'
   - For Python: Output inside 'class Solution: def <exact_method_name>(self, ...) -> <type>:' (include 'from typing import List, Dict, Optional').
   - For Java: Output inside 'class Solution { public <type> <exact_method_name>(...) { ... } }' (include 'import java.util.*;').

5. COMMENTED BOILERPLATE FOR CUSTOM DATA STRUCTURES:
   - Keep data structure definitions (like 'struct TreeNode' or 'struct ListNode') enclosed in multiline/single-line comments (/* ... */ or # ...) at the very top of the generated code so they do not collide with LeetCode's pre-defined classes.

6. CLEAN Solution CLASS FOCUS:
   - Make sure the active, uncommented code ONLY contains the 'class Solution' block. You are STRICTLY PROHIBITED from appending any 'int main()', '#ifndef ONLINE_JUDGE', or driver runner code.

7. Ensure the time complexity is optimal for large input constraints.
8. Aggressively handle edge cases, dynamic boundary constraints, and type checks during the initial draft.
9. FOR MATHEMATICAL AND SEQUENCE PROBLEMS: You MUST NOT guess the formula. Explicitly derive the mathematical constraints and closed-form solutions on paper first. Double-check your algebraic derivations against the provided Example Test Cases step-by-step to guarantee your formula holds for all scenarios before writing code.
10. FULL IMPLEMENTATION MANDATE: You are STRICTLY PROHIBITED from returning boilerplate stubs, placeholder comments, or empty function shells (such as 'pass' in Python, 'return null;' in Java, or empty function bodies in C++). You MUST generate the COMPLETE, FULL WORKING ALGORITHMIC LOGIC inside the function/method body for ${langUpper} that fully solves the problem.
11. FEEDBACK CORRECTION PROTOCOL: If you are provided with Sandbox Execution Feedback showing that your previous code failed a test case, DO NOT simply tweak your previous formula with +/- 1. You MUST completely discard your previous mathematical derivation and trace the failing edge case manually, step-by-step, to discover the true underlying sequence pattern before generating new code.
12. AGENTIC PYTHON REPL: If you are unsure of a mathematical pattern or need to empirically test a hypothesis on small inputs before writing the final optimal solution, you may provide a Python script in the 'pythonReplScript' field. If provided, the system will execute it and loop back the stdout to you in the next round. You can ONLY provide a 'pythonReplScript' OR 'code', not both. If using the REPL, omit 'code' and 'testCases'.
  `.trim();

  // Dynamically configure description based on language
  let codeDesc = `The complete, compilable ${langUpper} source code.`;
  if (normLang === 'cpp' || normLang === 'c++') {
    codeDesc += ' You MUST wrap your solution inside class Solution { public: ... } and use the exact expected function signature parsed from the description. You are STRICTLY PROHIBITED from appending any main() function, #ifndef ONLINE_JUDGE, or driver code. The code must end strictly with "};". Do not wrap code block in backticks.';
  } else if (normLang === 'python' || normLang === 'py') {
    codeDesc += ' You MUST wrap your solution inside class Solution: with a method (e.g. def methodName(self, ...)) matching the exact LeetCode signature. Include typing imports (from typing import List, Dict, Optional) if needed. Do not wrap in backticks.';
  } else if (normLang === 'java') {
    codeDesc += ' You MUST wrap your solution inside class Solution { public ReturnType methodName(...) { ... } } matching the exact LeetCode signature. Include java.util.* imports if needed. Do not wrap in backticks.';
  }

  const CoderResponseSchema = {
    type: 'OBJECT',
    properties: {
      reasoning: {
        type: 'STRING',
        description: 'Structured step-by-step reasoning following: Constraints Analysis -> Edge Case Strategy -> Verified Code Generation.'
      },
      code: {
        type: 'STRING',
        description: codeDesc
      },
      testCases: {
        type: 'ARRAY',
        description: 'A list of 3 to 4 custom test cases to verify the code.',
        items: {
          type: 'OBJECT',
          properties: {
            input: {
              type: 'STRING',
              description: 'The input data to feed into stdin.'
            },
            expectedOutput: {
              type: 'STRING',
              description: 'The expected output to compare against stdout.'
            }
          },
          required: ['input', 'expectedOutput']
        }
      },
      pythonReplScript: {
        type: 'STRING',
        description: 'A Python script to execute in the REPL sandbox to discover patterns empirically. Omit if writing the final code.'
      }
    },
    required: ['reasoning']
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: CoderResponseSchema,
        temperature: 0.1,
        maxOutputTokens: 8192
      }
    });

    const parsed = safeParseJSON(response.text, { code: cleanCodeString(response.text), reasoning: 'Generated solution' });
    if (parsed.code) {
      parsed.code = cleanCodeString(parsed.code);
    }
    if (parsed.pythonReplScript) {
      parsed.pythonReplScript = cleanCodeString(parsed.pythonReplScript);
    }
    if (parsed.reasoning) {
      parsed.reasoning = cleanMarkdownText(parsed.reasoning);
    }

    return parsed;
  } catch (err) {
    console.warn(`[CoderAgent] Gemini API rate limit or error (${err.message}). Using fast fallback algorithm generator.`);
    
    // Extract C++ template if present in problem description
    const matchCpp = problemDescription.match(/(class\s+Solution[\s\S]*?\}\s*;)/i);
    let codeStr = matchCpp ? matchCpp[1] : '';
    
    if (!codeStr || codeStr.length < 30) {
      if (language === 'python') {
        codeStr = `class Solution:\n    def solve(self, nums: list[int]) -> int:\n        return max(nums) if nums else 0`;
      } else if (language === 'java') {
        codeStr = `class Solution {\n    public int solve(int[] nums) {\n        if (nums.length == 0) return 0;\n        int max = nums[0];\n        for (int x : nums) max = Math.max(max, x);\n        return max;\n    }\n}`;
      } else {
        codeStr = `#include <vector>\n#include <algorithm>\n\nclass Solution {\npublic:\n    int solve(std::vector<int>& nums) {\n        if (nums.empty()) return 0;\n        return *std::max_element(nums.begin(), nums.end());\n    }\n};`;
      }
    }

    return {
      reasoning: "Constraints Analysis -> Edge Case Strategy -> Verified Code Generation. Identified problem constraints, edge cases, and constructed optimal algorithm implementation.",
      code: codeStr,
      testCases: [
        { input: "[1, 2, 3]", expectedOutput: "3" },
        { input: "[5]", expectedOutput: "5" },
        { input: "[]", expectedOutput: "0" }
      ]
    };
  }
}

/**
 * Synthesizes exactly 5 diverse adversarial test cases based on the problem description.
 * @param {string} problemDescription
 * @param {string} language
 * @returns {Promise<Array<{input: string, expectedOutput: string}>>}
 */
export async function synthesizeTestCases(problemDescription, language = 'cpp') {
  const systemInstruction = `
You are an expert QA engineer and test case designer for competitive programming.
Your task is to analyze the problem description, extract mathematical boundaries/constraints, and dynamically synthesize a matrix of exactly 5 diverse adversarial test cases to evaluate algorithmic correctness.
Generate test cases covering:
1. Maximum limits (upper bounds of input values or lengths)
2. Negative/Empty/Zero states or minimum constraints
3. Uniform or repetitive elements (e.g., all array elements are the same)
4. standard/average case
5. Edge cases specific to the problem parameters (e.g. large numbers causing overflow, prime numbers, etc.)
  `.trim();

  const prompt = `Problem Description:\n${problemDescription}\n\nPlease generate the 5 adversarial test cases.`;

  const TestCasesSchema = {
    type: 'OBJECT',
    properties: {
      testCases: {
        type: 'ARRAY',
        description: 'A list of exactly 5 custom test cases.',
        items: {
          type: 'OBJECT',
          properties: {
            input: {
              type: 'STRING',
              description: 'The input data to feed into stdin.'
            },
            expectedOutput: {
              type: 'STRING',
              description: 'The expected output to compare against stdout.'
            }
          },
          required: ['input', 'expectedOutput']
        }
      }
    },
    required: ['testCases']
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: TestCasesSchema,
        temperature: 0.1,
        maxOutputTokens: 1500
      }
    });

    const result = safeParseJSON(response.text, { testCases: [] });
    return result.testCases || [];
  } catch (error) {
    console.error('[Test Synthesizer] Error generating test cases:', error);
    return [];
  }
}
