import fetch from 'node-fetch'; // if node-fetch is not installed, Node 18+ has global fetch

/**
 * Converts a kebab-case slug into a camelCase method name
 */
export function slugToCamelCase(slug) {
  if (!slug) return 'solve';
  const specialMap = {
    'same-tree': 'isSameTree',
    'divide-two-integers': 'divide',
    'reverse-linked-list': 'reverseList',
    'invert-binary-tree': 'invertTree',
    'merge-two-sorted-lists': 'mergeTwoLists',
    'linked-list-cycle': 'hasCycle',
    'validate-binary-search-tree': 'isValidBST',
    'binary-tree-inorder-traversal': 'inorderTraversal',
    'maximum-depth-of-binary-tree': 'maxDepth',
  };
  if (specialMap[slug]) return specialMap[slug];
  return slug.split('-')
    .map((w, index) => index === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

/**
 * Helper to wrap a promise in a timeout limit
 */
export function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`LeetCode GraphQL request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise
      .then(res => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Helper to strip markdown formatting and sanitize special characters
 */
export function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') // Strip invalid control characters
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1') // [text](url) -> text
    .replace(/^#+\s+/gm, '') // headers
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/**
 * Special template for alternating sequence problem benchmark
 */
function getAlternatingSequenceTemplate() {
  return `Title: 3993. Maximum Value of an Alternating Sequence

Problem Description:
You are given three integers n, s, and m. A sequence seq of length n is considered valid if:
* Starting condition: seq[0] = s.
* Alternating condition: The sequence follows a "zig-zag" pattern, either seq[0] > seq[1] < seq[2] > seq[3] < ... or seq[0] < seq[1] > seq[2] < seq[3] > ...
* Adjacent constraint: For every adjacent pair, the absolute difference |seq[i] - seq[i - 1]| <= m.

The goal is to return the maximum possible element that can appear in any such valid sequence.

Constraints:
1 <= n, s <= 10^9
1 <= m <= 10^5

Example 1:
Input: n = 4, s = 3, m = 5
Output: 12

Example 2:
Input: n = 2, s = 4, m = 3
Output: 7

=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    long long maximumValue(int n, int s, int m) {
        
    }
};

Python:
class Solution:
    def maximumValue(self, n: int, s: int, m: int) -> int:
        pass

Java:
class Solution {
    public long maximumValue(int n, int s, int m) {
        
    }
}
`;
}

/**
 * Returns static fallback problem definitions with exact LeetCode C++, Python, Java boilerplate signatures
 */
export function getStaticFallbackProblem(slug) {
  const formattedTitle = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  let snippetsText = '';

  if (slug === 'same-tree') {
    snippetsText = `
=== EXPORTED STARTER TEMPLATES ===
C++:
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
class Solution {
public:
    bool isSameTree(TreeNode* p, TreeNode* q) {
        
    }
};

Python:
# Definition for a binary tree node.
# class TreeNode:
#     def __init__(self, val=0, left=None, right=None):
#         self.val = val
#         self.left = left
#         self.right = right
class Solution:
    def isSameTree(self, p: Optional[TreeNode], q: Optional[TreeNode]) -> bool:
        pass

Java:
/*
 * Definition for a binary tree node.
 * public class TreeNode {
 *     int val;
 *     TreeNode left;
 *     TreeNode right;
 *     TreeNode() {}
 *     TreeNode(int val) { this.val = val; }
 *     TreeNode(int val, TreeNode left, TreeNode right) {
 *         this.val = val;
 *         this.left = left;
 *         this.right = right;
 *     }
 * }
 */
class Solution {
    public boolean isSameTree(TreeNode p, TreeNode q) {
        return false;
    }
}
`;
  } else if (slug === 'divide-two-integers') {
    snippetsText = `
=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    int divide(int dividend, int divisor) {
        
    }
};

Python:
class Solution:
    def divide(self, dividend: int, divisor: int) -> int:
        pass

Java:
class Solution {
    public int divide(int dividend, int divisor) {
        return 0;
    }
}
`;
  } else if (slug === 'word-ladder-ii') {
    snippetsText = `
=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    vector<vector<string>> findLadders(string beginWord, string endWord, vector<string>& wordList) {
        
    }
};

Python:
class Solution:
    def findLadders(self, beginWord: str, endWord: str, wordList: List[str]) -> List[List[str]]:
        pass

Java:
class Solution {
    public List<List<String>> findLadders(String beginWord, String endWord, List<String> wordList) {
        return new ArrayList<>();
    }
}
`;
  } else if (slug === 'word-ladder') {
    snippetsText = `
=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    int ladderLength(string beginWord, string endWord, vector<string>& wordList) {
        
    }
};

Python:
class Solution:
    def ladderLength(self, beginWord: str, endWord: str, wordList: List[str]) -> int:
        pass

Java:
class Solution {
    public int ladderLength(String beginWord, String endWord, List<String> wordList) {
        return 0;
    }
}
`;
  } else if (slug === 'n-queens-ii') {
    snippetsText = `
=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    int totalNQueens(int n) {
        
    }
};

Python:
class Solution:
    def totalNQueens(self, n: int) -> int:
        pass

Java:
class Solution {
    public int totalNQueens(int n) {
        return 0;
    }
}
`;
  } else if (slug === 'n-queens') {
    snippetsText = `
=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    vector<vector<string>> solveNQueens(int n) {
        
    }
};

Python:
class Solution:
    def solveNQueens(self, n: int) -> List[List[str]]:
        pass

Java:
class Solution {
    public List<List<String>> solveNQueens(int n) {
        return new ArrayList<>();
    }
}
`;
  } else if (slug === 'merge-k-sorted-lists') {
    snippetsText = `
=== EXPORTED STARTER TEMPLATES ===
C++:
/**
 * Definition for singly-linked list.
 * struct ListNode {
 *     int val;
 *     ListNode *next;
 *     ListNode() : val(0), next(nullptr) {}
 *     ListNode(int x) : val(x), next(nullptr) {}
 *     ListNode(int x, ListNode *next) : val(x), next(next) {}
 * };
 */
class Solution {
public:
    ListNode* mergeKLists(vector<ListNode*>& lists) {
        
    }
};

Python:
class Solution:
    def mergeKLists(self, lists: List[Optional[ListNode]]) -> Optional[ListNode]:
        pass

Java:
class Solution {
    public ListNode mergeKLists(ListNode[] lists) {
        return null;
    }
}
`;
  } else if (slug === 'trapping-rain-water-ii') {
    snippetsText = `
=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    int trapRainWater(vector<vector<int>>& heightMap) {
        
    }
};

Python:
class Solution:
    def trapRainWater(self, heightMap: List[List[int]]) -> int:
        pass

Java:
class Solution {
    public int trapRainWater(int[][] heightMap) {
        return 0;
    }
}
`;
  } else if (slug === 'maximum-alternating-subsequence-sum' || slug === 'maximum-alternating-sum') {
    snippetsText = `
=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    long long maxAlternatingSum(vector<int>& nums) {
        
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
  } else if (slug === 'concatenated-words') {
    snippetsText = `
=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    vector<string> findAllConcatenatedWordsInADict(vector<string>& words) {
        
    }
};

Python:
class Solution:
    def findAllConcatenatedWordsInADict(self, words: List[str]) -> List[str]:
        pass

Java:
class Solution {
    public List<String> findAllConcatenatedWordsInADict(String[] words) {
        return new ArrayList<>();
    }
}
`;
  } else if (slug === 'minimum-cost-to-hire-k-workers') {
    snippetsText = `
=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    double mincostToHireWorkers(vector<int>& quality, vector<int>& wage, int k) {
        
    }
};

Python:
class Solution:
    def mincostToHireWorkers(self, quality: List[int], wage: List[int], k: int) -> float:
        pass

Java:
class Solution {
    public double mincostToHireWorkers(int[] quality, int[] wage, int k) {
        return 0.0;
    }
}
`;
  } else if (slug === 'letter-combinations-of-a-phone-number' || slug.includes('letter-combinations')) {
    snippetsText = `
=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    vector<string> letterCombinations(string digits) {
        
    }
};

Python:
class Solution:
    def letterCombinations(self, digits: str) -> List[str]:
        pass

Java:
class Solution {
    public List<String> letterCombinations(String digits) {
        return new ArrayList<>();
    }
}
`;
  } else if (slug === 'two-sum' || slug.includes('two-sum')) {
    snippetsText = `
=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        
    }
};

Python:
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        pass

Java:
class Solution {
    public int[] twoSum(int[] nums, int target) {
        return new int[]{};
    }
}
`;
  } else if (slug === 'string-to-integer-atoi' || slug.includes('atoi')) {
    snippetsText = `
=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    int myAtoi(string s) {
        
    }
};

Python:
class Solution:
    def myAtoi(self, s: str) -> int:
        pass

Java:
class Solution {
    public int myAtoi(String s) {
        return 0;
    }
}
`;
  } else if (slug === 'container-with-most-water' || slug.includes('most-water')) {
    snippetsText = `
=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    int maxArea(vector<int>& height) {
        
    }
};

Python:
class Solution:
    def maxArea(self, height: List[int]) -> int:
        pass

Java:
class Solution {
    public int maxArea(int[] height) {
        return 0;
    }
}
`;
  } else if (slug === '3sum' || slug.includes('3sum')) {
    snippetsText = `
=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    vector<vector<int>> threeSum(vector<int>& nums) {
        
    }
};

Python:
class Solution:
    def threeSum(self, nums: List[int]) -> List[List[int]]:
        pass

Java:
class Solution {
    public List<List<Integer>> threeSum(int[] nums) {
        return new ArrayList<>();
    }
}
`;
  } else {
    const methodName = slugToCamelCase(slug);
    let retTypeCpp = 'int';
    let paramTypeCpp = 'vector<int>& nums';
    let retTypePy = 'int';
    let paramTypePy = 'nums: List[int]';
    let retTypeJava = 'int';
    let paramTypeJava = 'int[] nums';

    if (slug.includes('string') || slug.includes('word') || slug.includes('letter') || slug.includes('text')) {
      retTypeCpp = 'vector<string>';
      paramTypeCpp = 'string s';
      retTypePy = 'List[str]';
      paramTypePy = 's: str';
      retTypeJava = 'List<String>';
      paramTypeJava = 'String s';
    }

    snippetsText = `
=== EXPORTED STARTER TEMPLATES ===
C++:
class Solution {
public:
    ${retTypeCpp} ${methodName}(${paramTypeCpp}) {
        
    }
};

Python:
class Solution:
    def ${methodName}(self, ${paramTypePy}) -> ${retTypePy}:
        pass

Java:
class Solution {
    public ${retTypeJava} ${methodName}(${paramTypeJava}) {
        return null;
    }
}
`;
  }

  return `Title: LeetCode - ${formattedTitle}

Problem Description:
The user wants a solution for LeetCode problem: ${slug}.

=== MANDATORY LEETCODE SIGNATURE DIRECTIVE ===
You MUST inspect the exported starter template or standard LeetCode function signature for this problem. You MUST preserve the EXACT function name, return type, and parameter types (e.g. vector<string> letterCombinations(string digits), int myAtoi(string s), vector<int> twoSum(vector<int>& nums, int target)). NEVER invent custom function names or change parameter/return types under any circumstances.

${snippetsText}`;
}

/**
 * Extracts content slug directly from LeetCode URL, attempts GraphQL question query for live snippets,
 * and falls back to static problem dictionary if GraphQL is unavailable.
 */
export async function fetchLeetCodeProblem(problemUrl) {
  const match = problemUrl.match(/problems\/([^/]+)/);
  if (!match) {
    throw new Error('Invalid LeetCode URL. Could not extract problem slug.');
  }
  const slug = match[1];
  console.log(`[LeetCode Parser] Ingesting problem slug: ${slug}`);

  if (slug === 'maximum-value-of-an-alternating-sequence' || slug === '3993' || slug.includes('alternating-sequence')) {
    return getAlternatingSequenceTemplate();
  }

  // Attempt GraphQL query directly to LeetCode API
  try {
    const fetchFunc = typeof globalThis.fetch === 'function' ? globalThis.fetch : fetch;
    const response = await withTimeout(
      fetchFunc('https://leetcode.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': `https://leetcode.com/problems/${slug}/`
        },
        body: JSON.stringify({
          query: `query getQuestionDetail($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
              questionId
              title
              content
              codeSnippets {
                lang
                langSlug
                code
              }
              exampleTestcaseList
            }
          }`,
          variables: { titleSlug: slug }
        })
      }),
      1500
    );

    if (response.ok) {
      const data = await response.json();
      const q = data?.data?.question;
      if (q && (q.content || (q.codeSnippets && q.codeSnippets.length > 0))) {
        const title = q.title || slug;
        const rawContent = q.content || '';
        const cleanDescription = stripMarkdown(rawContent.replace(/<[^>]*>/g, ' '));

        let snippetsText = '=== EXPORTED STARTER TEMPLATES ===\n';
        if (q.codeSnippets && Array.isArray(q.codeSnippets)) {
          q.codeSnippets.forEach(s => {
            if (s.langSlug === 'cpp' || s.lang === 'C++') {
              snippetsText += `C++:\n${s.code}\n\n`;
            } else if (s.langSlug === 'python3' || s.langSlug === 'python' || s.lang === 'Python3') {
              snippetsText += `Python:\n${s.code}\n\n`;
            } else if (s.langSlug === 'java' || s.lang === 'Java') {
              snippetsText += `Java:\n${s.code}\n\n`;
            }
          });
        }

        let testcasesText = '';
        if (q.exampleTestcaseList && q.exampleTestcaseList.length > 0) {
          testcasesText += '\n=== EXTRACTED SAMPLE TEST CASES ===\n';
          q.exampleTestcaseList.forEach((tc, idx) => {
            testcasesText += `Sample ${idx + 1}:\nInput:\n${tc}\n\n`;
          });
        }

        console.log(`[LeetCode Parser] Successfully fetched live GraphQL boilerplate and metadata for: ${slug}`);
        return `Title: ${title}\n\nProblem Description:\n${cleanDescription}\n${testcasesText}\n${snippetsText}`;
      }
    }
  } catch (err) {
    console.warn(`[LeetCode Parser] Live GraphQL query failed/timed out (${err.message}). Using comprehensive static problem boilerplate dictionary.`);
  }

  return getStaticFallbackProblem(slug);
}
