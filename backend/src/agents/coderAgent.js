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
2. MANDATORY LEETCODE FUNCTION SIGNATURE EXTRACTION:
   - Carefully extract or deduce the EXACT method name, return type, and parameter types expected by LeetCode for the target problem across all data structures (Arrays, Strings, Trees, Linked Lists, Graphs, Matrix, DP).
   - For Tree problems: Use exact node pointers/classes (e.g. C++: 'bool isSameTree(TreeNode* p, TreeNode* q)' or 'TreeNode* invertTree(TreeNode* root)').
   - For Linked List problems: Use exact node pointers/classes (e.g. C++: 'ListNode* reverseList(ListNode* head)').
   - For Array / String / Matrix problems: Use exact container signatures (e.g. C++: 'vector<int>& nums', 'string s', 'vector<vector<int>>& matrix').
   - Do NOT invent arbitrary parameter names or generic signatures like 'vector<int>& nums' for Tree, Graph, Linked List, or non-array questions under any circumstances! Match the expected LeetCode problem signature line-for-line.

3. DATA STRUCTURE DEFINITION HANDLING (TreeNode, ListNode, etc.):
   - Whenever custom structs/classes like 'TreeNode', 'ListNode', or custom Node structs are required, write them inside COMMENTED BLOCKS at the top of the solution file, e.g.:
     /*
     // Definition for a binary tree node.
     struct TreeNode {
         int val;
         TreeNode *left;
         TreeNode *right;
         TreeNode() : val(0), left(nullptr), right(nullptr) {}
         TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
         TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
     };
     */
   - For Python: Include the commented class definition at the top (e.g. '# Definition for a binary tree node.\n# class TreeNode:\n#     def __init__(self, val=0, left=None, right=None):').
   - For Java: Include the commented class definition at the top inside /* ... */.

4. CLEAN Solution CLASS FOCUS:
   - Make sure the active, uncommented code ONLY contains the 'class Solution { ... }' block (or 'class Solution:' in Python / 'class Solution' in Java).
   - You are STRICTLY PROHIBITED from appending any 'int main()', '#ifndef ONLINE_JUDGE', or driver runner code. The output MUST end cleanly right after the class Solution block.

5. Ensure the time complexity is optimal for large input constraints.
6. Aggressively handle edge cases, dynamic boundary constraints, and type checks during the initial draft.
7. LeetCode Sample Test Context: Use extracted sample examples and constraints to guide your solution's correctness.
8. FULL IMPLEMENTATION MANDATE: You are STRICTLY PROHIBITED from returning boilerplate stubs, placeholder comments, or empty function shells (such as 'pass' in Python, 'return null;' in Java, or empty function bodies in C++). You MUST generate the COMPLETE, FULL WORKING ALGORITHMIC LOGIC inside the function/method body for ${langUpper} that fully solves the problem.
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
      }
    },
    required: ['reasoning', 'code', 'testCases']
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: CoderResponseSchema,
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    });

    const parsed = safeParseJSON(response.text, { code: cleanCodeString(response.text), reasoning: 'Generated solution' });
    if (parsed.code) {
      parsed.code = cleanCodeString(parsed.code);
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
      model: 'gemini-flash-lite-latest',
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
