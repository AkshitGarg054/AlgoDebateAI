/**
 * Helper to extract sample test cases from a problem description.
 * Looks for sections like "Example 1:", "Input:", "Output:" and parses inputs/outputs.
 */
export function extractSampleTestCases(description) {
  if (!description) return [];
  const testCases = [];
  
  // Regex to find Example blocks containing Input and Output
  const exampleRegex = /(?:Example\s*\d+|Example\s*:\s*)[\s\S]*?Input:\s*([\s\S]*?)Output:\s*([\s\S]*?)(?=\n\s*(?:Example|Constraints|Explanation|Note|Output|$))/gi;
  
  let match;
  while ((match = exampleRegex.exec(description)) !== null) {
    let inputRaw = match[1].trim();
    let outputRaw = match[2].trim();
    
    // Clean string by stripping HTML tags and trimming extra lines
    const cleanStr = (str) => {
      // Find the first line or content before explanation/constraints
      let firstPart = str.split(/(?:\n\s*\n|\n\s*(?:Explanation|Note|Constraints|Input|Output))/gi)[0];
      return firstPart
        .replace(/&nbsp;/g, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/[\r\n]+/g, '\n')
        .trim();
    };

    const cleanInput = cleanStr(inputRaw);
    const cleanOutput = cleanStr(outputRaw);

    if (cleanInput && cleanOutput) {
      testCases.push({
        input: cleanInput,
        expectedOutput: cleanOutput
      });
    }
  }
  return testCases;
}

/**
 * Helper to clean code strings by unescaping literal \n and stripping code block backticks.
 */
export function cleanCodeString(str) {
  if (!str || typeof str !== 'string') return '';
  let cleaned = str;

  // Extract code from markdown code fences if present
  const codeMatch = str.match(/```(?:cpp|python|java|c\+\+|py)?\s*([\s\S]*?)```/i);
  if (codeMatch && codeMatch[1] && codeMatch[1].trim().length > 15) {
    cleaned = codeMatch[1].trim();
  }

  if (cleaned.includes('\\n')) {
    cleaned = cleaned.replace(/\\n/g, '\n');
  }
  if (cleaned.includes('\\t')) {
    cleaned = cleaned.replace(/\\t/g, '\t');
  }
  cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/gm, '').replace(/```$/gm, '').replace(/```/g, '').trim();
  
  // Strip duplicate ListNode and TreeNode struct definitions to prevent re-definition errors in LeetCode
  cleaned = cleaned.replace(/\/\*\*[\s\S]*?Definition for singly-linked list[\s\S]*?\*\//gi, '');
  cleaned = cleaned.replace(/\/\*\*[\s\S]*?Definition for a binary tree node[\s\S]*?\*\//gi, '');
  cleaned = cleaned.replace(/struct\s+ListNode\s*\{[\s\S]*?\};?/g, '');
  cleaned = cleaned.replace(/struct\s+TreeNode\s*\{[\s\S]*?\};?/g, '');

  return cleaned.trim();
}

/**
 * Helper to clean markdown explanations by unescaping literal \n
 */
export function cleanMarkdownText(str) {
  if (!str || typeof str !== 'string') return '';
  let cleaned = str;
  if (cleaned.includes('\\n')) {
    cleaned = cleaned.replace(/\\n/g, '\n');
  }
  if (cleaned.includes('\\t')) {
    cleaned = cleaned.replace(/\\t/g, '\t');
  }
  return cleaned.trim();
}
