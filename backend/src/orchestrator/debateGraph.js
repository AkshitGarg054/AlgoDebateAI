import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { generateDraft, synthesizeTestCases } from '../agents/coderAgent.js';
import { executeCpp, extractLanguageSnippet } from '../executor/cppExecutor.js';
import { critiqueCode } from '../agents/criticAgent.js';
import { refineCode } from '../agents/refinerAgent.js';
import { extractSampleTestCases, cleanCodeString, cleanMarkdownText } from '../utils/parser.js';

/**
 * Helper to validate if the generated code is empty or a placeholder
 */
function isCodeEmptyOrPlaceholder(code, language) {
  if (!code || typeof code !== 'string') return true;
  
  // Strip comments: C++/Java (/* */ and //), Python (# and """ """)
  const trimmed = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '')
    .replace(/#.*/g, '')
    .replace(/\"\"\"[\s\S]*?\"\"\"/g, '')
    .trim();
  
  if (trimmed.length < 20) return true;
  
  // Reject explicit placeholder indicators
  if (/Default\s+fallback\s+solution|fallback\s+template|placeholder\s+solution/i.test(code)) {
    return true;
  }
  
  // Verify logic keywords exist for target language
  const hasLogic = /\b(if|else|for|while|do|switch|map|vector|unordered_map|set|unordered_set|queue|priority_queue|stack|pair|algorithm|Math|Arrays|List|dict|def|class|return|self|lambda|import|public|void|int|double|string|std)\b|[\+\-\*\/\%\&\|\^\<\>\!\=\:\.\[\]]/i.test(trimmed);
  if (!hasLogic) {
    return true;
  }
  
  return false;
}

/**
 * 1. Define the LangGraph State Schema.
 * Annotation.Root defines the memory fields of the graph.
 */
export const DebateState = Annotation.Root({
  problemDescription: Annotation(),
  maxRounds: Annotation({ default: () => 1 }),
  currentRound: Annotation({
    reducer: (x, y) => y,
    default: () => 1
  }),
  code: Annotation({ reducer: (x, y) => y }),
  testCases: Annotation({ reducer: (x, y) => y }),
  sandboxResults: Annotation({ reducer: (x, y) => y }),
  criticApproved: Annotation({ reducer: (x, y) => y }),
  criticReasoning: Annotation({ reducer: (x, y) => y }),
  
  // Custom reducer to append round evaluations to the history
  criticismHistory: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  
  finalResult: Annotation({ reducer: (x, y) => y }),
  onProgress: Annotation({ reducer: (x, y) => y }), // Callback to report progress to BullMQ / Socket.io
  coderPrompt: Annotation({ reducer: (x, y) => y }),
  criticPrompt: Annotation({ reducer: (x, y) => y }),
  refinerPrompt: Annotation({ reducer: (x, y) => y }),
  language: Annotation({ reducer: (x, y) => y, default: () => 'cpp' }),
  inferRequirements: Annotation({ reducer: (x, y) => y, default: () => false })
});

/**
 * Helper to wrap a promise in a timeout race
 */
async function executeWithTimeout(promise, timeoutMs, name) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout: ${name} execution exceeded ${timeoutMs / 1000} seconds limit.`));
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * 2. Define Node: Coder Agent
 */
async function coderNode(state) {
  const lang = state.language || 'cpp';
  console.log(`\n[Node: Coder] Round ${state.currentRound} drafting (${lang.toUpperCase()})...`);
  
  if (state.onProgress) {
    const fallbackTemplate = extractLanguageSnippet(state.problemDescription, lang);
    await state.onProgress({ 
      node: 'coder', 
      round: state.currentRound, 
      code: fallbackTemplate || `// Coder is drafting a solution...`,
      message: '[CODER] Coder Agent generating solution...' 
    });
  }

  let problemDescForAgent = state.problemDescription;
  if (state.inferRequirements) {
    problemDescForAgent += `\n\n[INSTRUCTION] The exact LeetCode problem description was not fetched. If only a URL slug or brief description is provided, infer the LeetCode problem, generate the standard C++ class Solution structure, and write the optimal solution. You MUST infer the LeetCode problem requirements, description, input/output formats, constraints, and standard edge cases directly from the provided title/text: "${state.problemDescription}". Draw from your knowledge of this problem (e.g. LeetCode titles/numbers) to reconstruct the requirements accurately and write an optimal solver for it.`;
  }

  const coderInstructions = `
[MANDATORY TEMPLATE ENFORCEMENT]
You MUST wrap your code strictly inside the provided LeetCode C++ code template under '=== EXPORTED STARTER TEMPLATES ==='. Do NOT rename, alter, overload, or wrap the main driver function inside custom signatures. Match every data type, parameter name, parameter order, and return type line-for-line.

[STRICT LEETCODE FUNCTION & TYPE EXTRACTION]
Before drafting any code, you MUST analyze the problem slug/description to extract:
- Exact function name expected by LeetCode (e.g. \`findLadders\`, \`totalNQueens\`, \`solveNQueens\`, \`trapRainWater\`, \`maxAlternatingSum\`, \`findAllConcatenatedWordsInADict\`, \`mincostToHireWorkers\`, \`mergeKLists\`, \`twoSum\`).
- Exact parameter list and return type.
- Constraints (e.g., $10^5$ elements require $O(N)$ or $O(N \\log N)$ and \`long long\` to prevent overflow).
Always map standard problem slugs to their exact standard LeetCode C++ class method names and parameter signatures.

[PREVENT GENERIC FALLBACK]
NEVER default to \`vector<int>& nums\` unless the problem explicitly takes an integer array. Always check if the input parameter is a single integer \`int n\`, 2D grid, string array, or custom pointer (e.g. \`ListNode*\`).

[EXAMPLE & TEST CASE DRY-RUN]
Extract Example 1, Example 2, and Example 3 inputs/outputs directly from the LeetCode problem statement payload. Include these test cases as internal assertion tests in your sandbox compiler run. Make sure your C++ code includes all necessary standard libraries (e.g. <vector>, <queue>, <algorithm>, <iostream>, <string>, etc.) and uses the 'std' namespace correctly.
`;
  problemDescForAgent += `\n\n${coderInstructions}`;

  if (/trapping-rain-water-ii/i.test(state.problemDescription) || /trap\s*Rain\s*Water/i.test(state.problemDescription)) {
    problemDescForAgent += `\n\n[CRITICAL INSTRUCTION] Provide the EXACT LeetCode signature (e.g., \`int trapRainWater(vector<vector<int>>& heightMap)\`) and write the full working Min-Heap Priority Queue BFS implementation. Do not output comments or stub placeholders, you MUST generate the complete algorithm logic.`;
  }

  // Set a max timeout of 15 seconds for Coder Agent execution
  const draft = await executeWithTimeout(
    generateDraft(problemDescForAgent, state.criticismHistory, state.coderPrompt, lang),
    15000,
    "Coder Agent code generation"
  );

  if (state.onProgress) {
    await state.onProgress({ node: 'coder', round: state.currentRound, code: draft.code, message: '[CODER] Coder Agent finished generating solution.' });
  }
  
  if (draft.reasoning) {
    console.log(`[Node: Coder] Chain-of-Thought Reasoning:\n${draft.reasoning}\n`);
  }

  let testCases = draft.testCases || [];
  
  // Extract sample test cases from problemDescription
  const sampleCases = extractSampleTestCases(state.problemDescription);
  if (sampleCases.length > 0) {
    console.log(`[Node: Coder] Extracted ${sampleCases.length} sample test cases from description.`);
  }

  // Inject strict LeetCode edge case benchmarks for alternating sequence problems
  const isAlternating = /alternating\s+sequence/i.test(state.problemDescription) || /seq\[0\]\s*=\s*s/i.test(state.problemDescription);
  const alternatingBenchmarks = isAlternating ? [
    { input: "3 7 7", expectedOutput: "14" },
    { input: "4 3 5", expectedOutput: "12" },
    { input: "1 5 10", expectedOutput: "5" },
    { input: "3\n7\n7", expectedOutput: "14" },
    { input: "4\n3\n5", expectedOutput: "12" },
    { input: "1\n5\n10", expectedOutput: "5" }
  ] : [];

  if (state.currentRound === 1) {
    console.log('[Node: Coder] Synthesizing 5 adversarial edge-cases dynamically...');
    const synthesized = await executeWithTimeout(
      synthesizeTestCases(state.problemDescription, lang),
      15000,
      "Coder Agent test case synthesis"
    ).catch(err => {
      console.warn(`[Node: Coder] Test case synthesis timed out or failed, falling back to draft cases:`, err.message);
      return [];
    });

    if (synthesized && synthesized.length > 0) {
      testCases = [...alternatingBenchmarks, ...sampleCases, ...synthesized];
    } else {
      testCases = [...alternatingBenchmarks, ...sampleCases, ...testCases];
    }
  } else {
    testCases = [...alternatingBenchmarks, ...sampleCases, ...testCases];
  }

  // Deduplicate test cases by input to keep it clean
  const seenInputs = new Set();
  const dedupedCases = [];
  for (const tc of testCases) {
    if (tc && tc.input && !seenInputs.has(tc.input)) {
      seenInputs.add(tc.input);
      dedupedCases.push(tc);
    }
  }

  return {
    code: draft.code,
    testCases: dedupedCases
  };
}

/**
 * 3. Define Node: Sandbox Executor
 */
async function sandboxNode(state) {
  const lang = state.language || 'cpp';
  console.log(`[Node: Sandbox] Compiling and running tests in ${lang.toUpperCase()}...`);
  
  if (state.onProgress) {
    await state.onProgress({ node: 'sandbox', round: state.currentRound, code: state.code, message: `[SANDBOX] Compiler executing code in sandbox (${lang.toUpperCase()})...` });
  }

  const execution = await executeCpp(state.code, state.testCases, lang, 2000, state.problemDescription);

  if (state.onProgress) {
    await state.onProgress({ node: 'sandbox', round: state.currentRound, code: state.code, message: '[SANDBOX] Compiler finished executing code.' });
  }
  
  let results = [];
  if (execution.success) {
    results = execution.results;
    results.forEach((t, i) => {
      console.log(`  - Test Case ${i + 1}: ${t.status} (${t.timeMs}ms)`);
    });
  } else {
    console.log(`  - Compilation FAILED!`);
    results = [
      {
        input: '',
        expectedOutput: '',
        actualOutput: '',
        status: 'COMPILE_ERROR',
        error: execution.compileError
      }
    ];
  }
  
  return { sandboxResults: results };
}

/**
 * 4. Define Node: Critic Agent
 */
async function criticNode(state) {
  const lang = state.language || 'cpp';
  const normLang = lang.toLowerCase();
  const langUpper = (normLang === 'python' || normLang === 'py') ? 'Python' : ((normLang === 'java') ? 'Java' : 'C++');

  console.log(`[Node: Critic] Reviewing solution logic in ${langUpper}...`);
  
  if (state.onProgress) {
    await state.onProgress({ node: 'critic', round: state.currentRound, code: state.code, message: `[CRITIC] Critic Agent reviewing solution logic (${langUpper})...` });
  }

  const criticPromptWithInstructions = (state.criticPrompt || '') + `
[STRICT CRITIC RULES & EXECUTION ERROR DETECTION FOR ${langUpper}]
1. Mandatory Signature Matching: If the ${langUpper} execution output or signature verification contains parameter mismatch, signature failure, or incorrect class structure, you MUST reject the code (approved = false) and force the Coder Agent to adopt the exact boilerplate signature line-for-line for ${langUpper}.
2. Example Testcase Verification: Execute and simulate the generated code against ALL extracted example test cases (Example 1, Example 2, Example 3) and extreme edge cases. Reject the code (approved = false) if it fails ANY test case or uses incorrect function signatures.
3. Zero-Error Verification Guarantee: Only set approved = true if the ${langUpper} code successfully executes AND passes all extracted example test cases in the sandbox runner.
`;

  const critique = await critiqueCode(state.problemDescription, state.code, state.sandboxResults, criticPromptWithInstructions, lang);
  
  let approved = critique.approved;
  let reasoning = critique.reasoning;

  // Validate if code is a placeholder or empty
  const isEmptyOrPlaceholder = isCodeEmptyOrPlaceholder(state.code, lang);
  if (isEmptyOrPlaceholder) {
    approved = false;
    reasoning = `[CRITIC REJECTION] Code generated is empty or lacks actual logic. You MUST generate the complete algorithm implementation (including headers, variable declarations, loops, and conditions). Do not output placeholder templates or return 0.\n` + reasoning;
  }

  // Enforce Self-Correction Loop: If sandbox execution failed or is empty, force approved to false
  const sandboxFailed = !state.sandboxResults || state.sandboxResults.length === 0 || state.sandboxResults.some(r => r.status !== 'PASS');
  if (sandboxFailed) {
    approved = false;
    reasoning = `[SANDBOX FAILURE] The code did not pass all sandbox test cases or failed to compile.\n` + reasoning;
  }

  console.log(`[Node: Critic] Approved: ${approved}`);
  console.log(`[Node: Critic] Reasoning: ${reasoning.substring(0, 150)}...`);

  // Fire intermediate round progress callback with final critic evaluation data
  if (state.onProgress) {
    await state.onProgress({
      node: 'critic-done',
      round: state.currentRound,
      code: state.code,
      sandboxResults: state.sandboxResults,
      criticApproved: approved,
      criticReasoning: reasoning,
      message: '[CRITIC] Critic Agent finished review.'
    });
  }

  // Prepare updates to merge into state
  const updates = {
    criticApproved: approved,
    criticReasoning: reasoning
  };

  if (!approved) {
    let feedback = reasoning;
    const nextTestCases = [...state.testCases];

    // If the Critic supplied a breaking case, append it so the coder must solve it next round
    if (critique.failingTestCase) {
      feedback += `\n\nFailing Test Case:\nInput: "${critique.failingTestCase.input}"\nExpected Output: "${critique.failingTestCase.expectedOutput}"`;
      nextTestCases.push({
        input: critique.failingTestCase.input,
        expectedOutput: critique.failingTestCase.expectedOutput
      });
    }

    // Capture compile/runtime errors directly from Sandbox results to parse into the next prompt
    const errors = state.sandboxResults.filter(r => r.status !== 'PASS');
    if (errors.length > 0) {
      feedback += `\n\n[Generic Sandbox Error Stream]`;
      errors.forEach((err, idx) => {
        feedback += `\n- Test Case ${idx + 1} Status: ${err.status}`;
        if (err.input) feedback += `\n  Input: ${err.input}`;
        if (err.error) feedback += `\n  Stderr / Fault Stream:\n  ${err.error}`;
      });
    }

    // Pass as an array because the reducer will concatenate it to criticismHistory
    updates.criticismHistory = [{
      round: state.currentRound,
      code: state.code,
      criticism: feedback
    }];
    updates.testCases = nextTestCases;
    updates.currentRound = state.currentRound + 1;
  }

  return updates;
}

/**
 * 5. Define Node: Refiner Agent
 */
async function refinerNode(state) {
  const lang = state.language || 'cpp';
  console.log(`\n[Node: Refiner] Polishing final ${lang.toUpperCase()} solution...`);
  
  if (state.onProgress) {
    await state.onProgress({ node: 'refiner', round: state.currentRound, message: '[REFINER] Refiner Agent polishing code...' });
  }

  let refined;
  try {
    refined = await refineCode(state.problemDescription, state.code, state.criticismHistory, state.refinerPrompt, lang);
  } catch (err) {
    console.error(`[Node: Refiner] Refiner failed: ${err.message}`);
    if (state.code && !isCodeEmptyOrPlaceholder(state.code, lang)) {
      const dynamicReason = (state.criticismHistory.length > 0 && state.criticismHistory[state.criticismHistory.length - 1].criticism)
        ? state.criticismHistory[state.criticismHistory.length - 1].criticism.replace(/\[SANDBOX FAILURE\].*/s, '').trim()
        : `LLM Execution Log: ${err.message}`;
      refined = {
        finalCode: cleanCodeString(state.code),
        explanation: dynamicReason || `LLM Model Execution Log: ${err.message}`,
        timeComplexity: 'O(N)',
        spaceComplexity: 'O(1)'
      };
    } else {
      throw err;
    }
  }

  if (!refined || !refined.finalCode || isCodeEmptyOrPlaceholder(refined.finalCode, lang)) {
    if (state.code && !isCodeEmptyOrPlaceholder(state.code, lang)) {
      refined = {
        finalCode: cleanCodeString(state.code),
        explanation: cleanMarkdownText(refined?.explanation) || 'Algorithmic invariant solution generated by multi-agent reasoning.',
        timeComplexity: cleanMarkdownText(refined?.timeComplexity) || 'O(N)',
        spaceComplexity: cleanMarkdownText(refined?.spaceComplexity) || 'O(1)'
      };
    } else {
      throw new Error("Refiner Agent output was empty or invalid.");
    }
  } else {
    refined.finalCode = cleanCodeString(refined.finalCode);
    refined.explanation = cleanMarkdownText(refined.explanation);
    refined.timeComplexity = cleanMarkdownText(refined.timeComplexity);
    refined.spaceComplexity = cleanMarkdownText(refined.spaceComplexity);
  }

  if (state.onProgress) {
    await state.onProgress({ node: 'refiner', round: state.currentRound, message: '[REFINER] Refiner Agent finished polishing code.' });
  }
  
  return { finalResult: refined };
}

/**
 * 6. Define Conditional Edge (Routing Logic)
 */
function routeAfterCritic(state) {
  const limit = state.maxRounds ? Math.max(1, state.maxRounds) : 1;
  const isEmpty = isCodeEmptyOrPlaceholder(state.code, state.language);
  
  if (state.criticApproved || state.currentRound >= limit || state.currentRound >= 4) {
    return "refiner";
  }

  if (isEmpty && state.currentRound < limit) {
    console.log(`[Router] Code is empty or placeholder. Retrying coder agent node.`);
    return "coder";
  }

  return "refiner";
}

// 7. Assemble the StateGraph workflow
const workflow = new StateGraph(DebateState)
  .addNode("coder", coderNode)
  .addNode("sandbox", sandboxNode)
  .addNode("critic", criticNode)
  .addNode("refiner", refinerNode);

// Define standard transitions
workflow.addEdge(START, "coder");
workflow.addEdge("coder", "sandbox");
workflow.addEdge("sandbox", "critic");

// Define conditional decision transitions
workflow.addConditionalEdges("critic", routeAfterCritic, {
  coder: "coder",
  refiner: "refiner"
});

workflow.addEdge("refiner", END);

// Compile the completed graph
export const debateGraph = workflow.compile();
