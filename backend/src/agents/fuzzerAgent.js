import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("GEMINI_API_KEY is not set in .env");
}
const ai = new GoogleGenAI({ apiKey });

/**
 * Generates a naive, brute-force Python solution that is guaranteed to be correct,
 * disregarding time complexity limits.
 */
export async function generateNaiveSolver(problemDescription) {
  const prompt = `Problem Description:\n${problemDescription}\n\n` +
    `Your task is to write a strictly correct NAIVE BRUTE-FORCE solver in Python 3. ` +
    `Do not try to optimize it. Use O(N^2), O(N!), DFS, or backtracking if necessary. ` +
    `Correctness is the ONLY priority. ` +
    `\n\nReturn the solution as a simple Python script that reads from sys.stdin and prints to sys.stdout. ` +
    `Do NOT wrap your code in a class unless required to parse the input. ` +
    `You MUST handle input parsing correctly by reading standard input (e.g., using sys.stdin.read().split()). ` +
    `Do NOT output any markdown blocks, just the raw Python code string.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    });

    let code = response.text.trim();
    if (code.startsWith('```')) {
      code = code.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
    }
    return code;
  } catch (err) {
    console.error(`[FuzzerAgent] Failed to generate naive solver: ${err.message}`);
    throw err;
  }
}

/**
 * Generates a Python script that outputs 50 random valid test cases for the problem.
 */
export async function generateTestCaseGenerator(problemDescription) {
  const prompt = `Problem Description:\n${problemDescription}\n\n` +
    `Your task is to write a Python 3 script that generates exactly 50 random valid test cases for this problem. ` +
    `The inputs should be small enough that an O(N!) or O(N^2) brute-force solver can solve them within 100ms. ` +
    `(e.g., keep array lengths under 12, numbers under 50). ` +
    `\n\nPrint the test cases to standard output exactly in the format that the problem expects for standard input. ` +
    `If the problem expects multiple inputs (like n, s, m), print them space-separated or newline-separated as standard. ` +
    `Separate each distinct test case with a line containing exactly "---TEST_CASE_DELIMITER---". ` +
    `\n\nDo NOT output any markdown blocks, just the raw Python code string.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    });

    let code = response.text.trim();
    if (code.startsWith('```')) {
      code = code.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
    }
    return code;
  } catch (err) {
    console.error(`[FuzzerAgent] Failed to generate test case generator: ${err.message}`);
    throw err;
  }
}
