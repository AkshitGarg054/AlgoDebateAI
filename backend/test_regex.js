import { extractSampleTestCases } from './src/utils/parser.js';

const description = `Title: 3993. Maximum Value of an Alternating Sequence

Problem Description:
You are given three integers n, s, and m. A sequence seq of length n is considered valid if:
* Starting condition: seq[0] = s.
* Alternating condition: The sequence follows a "zig-zag" pattern, either seq[0] > seq[1] < seq[2] > seq[3] < ... or seq[0] < seq[1] > seq[2] < seq[3] > ...
* Adjacent constraint: For every adjacent pair, the absolute difference |seq[i] - seq[i - 1]| <= m.

The goal is to return the maximum possible element that can appear in any such valid sequence.

Example 1:
Input: n = 4, s = 3, m = 5
Output: 12

Example 99 (Custom Debug Case):
Input:
4 3 5
Output:
12
`;

console.log(extractSampleTestCases(description));
