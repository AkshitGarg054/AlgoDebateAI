import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { executeCpp } from './cppExecutor.js'; // To run the C++ executable against generated tests!

function runProcess(cmd, args, input, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    let isTimeout = false;

    const timeout = setTimeout(() => {
      isTimeout = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ status: 'ERROR', output: '', error: err.message });
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (isTimeout) {
        resolve({ status: 'TIMEOUT', output: stdout, error: 'Execution timed out.' });
      } else if (code !== 0) {
        resolve({ status: 'RTE', output: stdout, error: stderr || `Process exited with code ${code}` });
      } else {
        resolve({ status: 'PASS', output: stdout, error: '' });
      }
    });
  });
}

/**
 * Runs differential fuzzing.
 * @param {string} generatorCode Python code to generate inputs
 * @param {string} naiveCode Python code for naive solution
 * @param {string} cppCode C++ optimized code to test
 * @param {string} problemDescription Problem description for the C++ executor
 * @returns {Promise<{success: boolean, failingCase?: {input: string, expected: string, actual: string}, error?: string}>}
 */
export async function runDifferentialFuzzing(generatorCode, naiveCode, cppCode, problemDescription) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fuzz_'));
  const genPath = path.join(tmpDir, 'gen.py');
  const naivePath = path.join(tmpDir, 'naive.py');

  try {
    await fs.writeFile(genPath, generatorCode);
    await fs.writeFile(naivePath, naiveCode);

    // 1. Generate inputs
    const genRes = await runProcess('python', [genPath], '', 10000);
    if (genRes.status !== 'PASS') {
      return { success: true, error: `[Fuzzer] Generator script failed: ${genRes.error}` }; // Don't penalize Coder
    }

    let rawInputs = genRes.output.split('---TEST_CASE_DELIMITER---').map(s => s.trim()).filter(s => s.length > 0);
    if (rawInputs.length === 0) {
      return { success: true, error: `[Fuzzer] Generator produced 0 valid test cases.` };
    }

    // Limit to 50
    rawInputs = rawInputs.slice(0, 50);

    // 2. Fuzz!
    for (let i = 0; i < rawInputs.length; i++) {
      const input = rawInputs[i];
      
      // Get expected from Naive
      const naiveRes = await runProcess('python', [naivePath], input, 5000);
      if (naiveRes.status !== 'PASS') {
         // Naive solver failed on valid input. Skip this test or abort fuzzing safely.
         continue;
      }
      const expectedOutput = naiveRes.output.trim();

      // Test against optimized C++
      // Since C++ compilation is slow, we should ideally compile once. executeCpp compiles every time.
      // We will compile the CPP code once manually, or just use the executeCpp with the single test case.
      // executeCpp accepts an array of test cases. Let's pass the single test case.
      const cppTestCases = [{ input, expectedOutput }];
      const cppResults = await executeCpp(cppCode, cppTestCases, problemDescription, 5000);
      
      const cppRes = cppResults[0];
      if (cppRes.status !== 'PASS') {
        // We found a counter-example!
        return {
          success: false,
          failingCase: {
            input: input,
            expected: expectedOutput,
            actual: cppRes.actualOutput || cppRes.error || 'Timeout/RTE'
          }
        };
      }
    }

    return { success: true };
  } catch (err) {
    return { success: true, error: `[Fuzzer System Error]: ${err.message}` };
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}
