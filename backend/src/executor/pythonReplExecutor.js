import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

/**
 * Executes a Python script in a temporary isolated environment.
 * @param {string} script - The Python code to run.
 * @param {number} timeoutMs - Maximum execution time in milliseconds (default 5000).
 * @returns {Promise<{success: boolean, output: string, error?: string}>}
 */
export async function executePythonRepl(script, timeoutMs = 5000) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repl_'));
  const scriptPath = path.join(tmpDir, 'script.py');
  
  try {
    await fs.writeFile(scriptPath, script);
    
    return new Promise((resolve) => {
      const child = spawn('python', [scriptPath]);
      
      let stdout = '';
      let stderr = '';
      let isTimeout = false;

      const timeout = setTimeout(() => {
        isTimeout = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
        // Prevent infinite memory bloat from prints
        if (stdout.length > 50000) child.kill('SIGKILL');
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          output: stdout,
          error: `Execution Error: ${err.message}`
        });
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (isTimeout) {
          resolve({
            success: false,
            output: stdout,
            error: `Timeout: Script execution exceeded ${timeoutMs}ms limit.`
          });
        } else if (code !== 0) {
          resolve({
            success: false,
            output: stdout,
            error: stderr || `Process exited with code ${code}`
          });
        } else {
          resolve({
            success: true,
            output: stdout
          });
        }
      });
    });
  } catch (err) {
    return { success: false, output: '', error: err.message };
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}
