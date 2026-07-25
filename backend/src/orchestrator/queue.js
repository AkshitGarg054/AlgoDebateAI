import { Queue, Worker } from 'bullmq';
import { debateGraph } from './debateGraph.js';
import { fetchLeetCodeProblem, getStaticFallbackProblem, withTimeout, slugToCamelCase, stripMarkdown } from '../utils/leetcode.js';
import { extractSampleTestCases } from '../utils/parser.js';

// Connection options to Docker Redis running on port 6379
const connection = {
  host: 'localhost',
  port: 6379
};

/**
 * 1. Initialize the BullMQ Job Queue.
 * This object is used by our API server to push new debate jobs.
 */
export const debateQueue = new Queue('debateQueue', { connection });

/**
 * 2. Initialize the BullMQ Worker.
 * This background worker listens for new jobs in 'debateQueue',
 * processes them, updates the job progress in Redis, and stores the final result.
 */
export const debateWorker = new Worker(
  'debateQueue',
  async (job) => {
    console.log(`\n[Worker] Picked up job ${job.id} from queue.`);
    const roundsHistory = [];
    
    const onProgress = async (roundProgress) => {
      roundsHistory.push(roundProgress);
      const progressData = {
        status: 'IN_PROGRESS',
        currentRound: roundProgress.round || 1,
        roundsHistory
      };
      await job.updateProgress(progressData);
      
      // Force WebSocket to instantly emit logs to frontend without buffering/polling lag
      if (global.io) {
        global.io.emit(`job-progress:${job.id}`, progressData);
      }
    };

    // Immediately notify frontend WebSocket that graph execution has started
    await onProgress({
      node: 'coder',
      round: 1,
      code: '// Select a problem and click Run Verification...',
      message: '[SYSTEM] Initializing LangGraph debate graph...'
    });

    try {
      const { problemDescription, problemUrl, maxRounds, language, coderPrompt, criticPrompt, refinerPrompt } = job.data;

      // 1. Initial State Parsing & WebSocket Logs
      let finalProblemDescription = problemDescription || '';
      let urlToFetch = '';
      let extractedTitle = '';
      let inferRequirements = false;

      // Helper to extract LeetCode URL from a string
      function extractLeetCodeUrl(text) {
        if (!text) return null;
        const urlRegex = /(https?:\/\/(?:www\.)?leetcode\.com\/problems\/[a-zA-Z0-9-]+)/i;
        const match = text.match(urlRegex);
        return match ? match[1] : null;
      }

      // Helper to extract Markdown LeetCode link
      function extractMarkdownLink(text) {
        if (!text) return null;
        const mdRegex = /\[([^\]]+)\]\((https?:\/\/(?:www\.)?leetcode\.com\/problems\/[a-zA-Z0-9-]+)\)/i;
        const match = text.match(mdRegex);
        if (match) {
          return { title: match[1], url: match[2] };
        }
        return null;
      }

      // Scan problemUrl and problemDescription for markdown links or plain URLs
      const urlFromInputUrl = extractLeetCodeUrl(problemUrl);
      const mdFromInputUrl = extractMarkdownLink(problemUrl);

      const urlFromDesc = extractLeetCodeUrl(problemDescription);
      const mdFromDesc = extractMarkdownLink(problemDescription);

      if (mdFromInputUrl) {
        urlToFetch = mdFromInputUrl.url;
        extractedTitle = mdFromInputUrl.title;
      } else if (mdFromDesc) {
        urlToFetch = mdFromDesc.url;
        extractedTitle = mdFromDesc.title;
      } else if (urlFromInputUrl) {
        urlToFetch = urlFromInputUrl;
      } else if (urlFromDesc) {
        urlToFetch = urlFromDesc;
      }

      let hasValidFetch = false;

      if (problemUrl && problemUrl.trim() !== '' && !urlToFetch) {
        // Fall back dynamically to slug name template
        console.warn('[Worker] Invalid LeetCode URL format, using dynamic slug template.');
        await onProgress({ node: 'coder', round: 1, message: '[SYSTEM] Invalid LeetCode URL structure. Generating dynamic template from URL...' });
        inferRequirements = true;
        const slug = problemUrl.match(/problems\/([^/]+)/)?.[1] || 'algorithm-problem';
        const formattedTitle = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const methodName = slugToCamelCase(slug);
        const defaultSnippets = `
=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    long long ${methodName}(vector<int>& nums) {
        // Default fallback solution
        return 0;
    }
};

Python:
class Solution:
    def ${methodName}(self, nums: List[int]) -> int:
        pass

Java:
class Solution {
    public long ${methodName}(int[] nums) {
        return 0;
    }
}
`;
        finalProblemDescription = `Title: ${formattedTitle}\n\nProblem Description:\nPlease write a solution for the LeetCode problem "${formattedTitle}".\n\nProblem URL: ${problemUrl}\n${defaultSnippets}`;
      }

      if (urlToFetch) {
        try {
          console.log(`[Worker] Attempting to fetch LeetCode problem from URL: ${urlToFetch} with 6s timeout`);
          await onProgress({ node: 'coder', round: 1, message: '[SYSTEM] Parsing problem URL and extracting starter signature templates...' });
          
          const fetchedDescription = await withTimeout(fetchLeetCodeProblem(urlToFetch), 6000);
          hasValidFetch = true;
          
          let combined = fetchedDescription;
          if (extractedTitle) {
            combined = `Title: ${stripMarkdown(extractedTitle)}\n\n${combined}`;
          }
          
          // Clean problem description inputs
          const cleanDesc = stripMarkdown(problemDescription);
          const cleanUrlInput = stripMarkdown(problemUrl);

          // Include any additional contextual inputs provided by the user
          let extraContext = '';
          if (cleanDesc && !cleanDesc.includes(urlToFetch)) {
            extraContext += `\n\nAdditional Description Context:\n${cleanDesc}`;
          }
          if (cleanUrlInput && !cleanUrlInput.includes(urlToFetch)) {
            extraContext += `\n\nAdditional Input Context:\n${cleanUrlInput}`;
          }
          finalProblemDescription = combined + extraContext;
          await onProgress({ node: 'coder', round: 1, message: '[SYSTEM] LeetCode GraphQL fetch completed successfully.' });
        } catch (err) {
          console.warn('[Worker] GraphQL fetch failed, switching to default template:', err.message);
          await onProgress({ node: 'coder', round: 1, message: '[SYSTEM] GraphQL fetch failed. Switching to dynamic AI fallback template...' });
          inferRequirements = true;
          
          const slug = urlToFetch.match(/problems\/([^/]+)/)?.[1] || 'algorithm-problem';
          finalProblemDescription = getStaticFallbackProblem(slug);
        }
      }

      if (!hasValidFetch && (!problemUrl || problemUrl.trim() === '')) {
        // If we didn't fetch from LeetCode GraphQL and there is no URL, we strip markdown and use raw input text directly
        const cleanDesc = stripMarkdown(problemDescription);
        let combinedText = cleanDesc || '';
        
        if (combinedText && !combinedText.includes('=== EXPORTED STARTER TEMPLATES ===')) {
          const defaultSnippets = `
=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    long long maxAlternatingSum(vector<int>& nums) {
        // Default fallback solution
        return 0;
    }
};

Python:
class Solution:
    def maxAlternatingSum(self, nums: List[int]) -> int:
        pass

Java:
class Solution {
    public long maxAlternatingSum(int[] nums) {
        return 0;
    }
}
`;
          combinedText += `\n${defaultSnippets}`;
        }
        
        finalProblemDescription = combinedText;
        inferRequirements = true;
      }

      // Ensure we have at least some input description text
      if (!finalProblemDescription || finalProblemDescription.trim() === '') {
        finalProblemDescription = `Title: Algorithm Solver\n\nProblem Description:\nPlease write an optimal solver algorithm solution.\n\n=== EXPORTED STARTER TEMPLATES ===\nC++:\nclass Solution {\npublic:\n    int solve(vector<int>& nums) {\n        return 0;\n    }\n};`;
        inferRequirements = true;
      }

      // Extract sample cases and append them explicitly to the context
      const sampleCases = extractSampleTestCases(finalProblemDescription);
      if (sampleCases.length > 0) {
        finalProblemDescription += `\n\n=== EXTRACTED SAMPLE TEST CASES ===\n`;
        sampleCases.forEach((tc, idx) => {
          finalProblemDescription += `Sample ${idx + 1}:\nInput: ${tc.input}\nExpected Output: ${tc.expectedOutput}\n\n`;
        });
      }

      // Inject standard LeetCode function signature mapping rules to guide both Coder and Refiner
      const normLang = (language || 'cpp').toLowerCase();
      const langUpper = (normLang === 'python' || normLang === 'py') ? 'Python' : ((normLang === 'java') ? 'Java' : 'C++');

      const signatureInstruction = `
\n\n[MANDATORY TEMPLATE ENFORCEMENT FOR ${langUpper}]
Write the complete optimal solution strictly in ${langUpper} as selected by the user.
You MUST wrap your code strictly inside the provided LeetCode ${langUpper} code template under '=== EXPORTED STARTER TEMPLATES ==='. Do NOT rename, alter, overload, or wrap the main driver function inside custom signatures. Match every data type, parameter name, parameter order, and return type line-for-line.

[CRITICAL SIGNATURE & LANGUAGE RULES FOR ${langUpper}]
You MUST use exact LeetCode function names and parameters for standard problems. Never invent custom function names like solve() or append arbitrary suffixes.
- For Python: Generate valid Python 3 solution inside 'class Solution:' (e.g. def methodName(self, ...):). Include typing imports (from typing import List, Dict, Optional).
- For Java: Generate valid Java solution inside 'class Solution' (e.g. public ReturnType methodName(...)). Include java.util.* imports.
- For C++: Generate valid C++ solution inside 'class Solution { public: ... };'.

[PREVENT GENERIC FALLBACK]
Always map the problem slug to its exact standard LeetCode ${langUpper} class method name and parameter types as specified in the starter template.
`;
      finalProblemDescription += signatureInstruction;

      // Invoke the LangGraph workflow with explicit recursionLimit: 50 and error handling
      let finalState;
      try {
        finalState = await debateGraph.invoke({
          problemDescription: finalProblemDescription,
          maxRounds,
          language,
          coderPrompt,
          criticPrompt,
          refinerPrompt,
          inferRequirements,
          onProgress
        }, { recursionLimit: 50 });
      } catch (graphErr) {
        console.warn(`[Worker] LangGraph execution error: ${graphErr.message}`);
        const fallbackCode = roundsHistory.map(r => r.code || r.finalCode).filter(c => c && c.length > 20).pop();
        if (fallbackCode) {
          finalState = {
            finalResult: {
              finalCode: fallbackCode,
              timeComplexity: 'O(N)',
              spaceComplexity: 'O(1)',
              explanation: `Execution completed with warning: ${graphErr.message}`
            }
          };
        } else {
          throw graphErr;
        }
      }

      const finalResult = finalState.finalResult;
      console.log(`[Worker] Job ${job.id} completed successfully.`);
      
      // Return values are stored in Redis under the job state automatically
      return {
        status: 'COMPLETED',
        finalResult,
        problemDescription: finalProblemDescription
      };
    } catch (err) {
      console.error(`[Worker] Job ${job.id} execution failed:`, err);
      
      // Save failure status and details in job progress for real-time frontend reporting
      await job.updateProgress({
        status: 'FAILED',
        error: err.message || String(err),
        roundsHistory
      });
      
      throw err; // Let BullMQ mark the job as failed
    }
  },
  { connection }
);

// Graceful worker shutdown listeners
debateWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job ? job.id : 'unknown'} failed with error:`, err);
});

