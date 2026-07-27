import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { debateQueue, debateWorker } from './orchestrator/queue.js';
import { extractSampleTestCases } from './utils/parser.js';

const app = express();
const httpServer = createServer(app);

// Enable CORS for our React app (default Vite dev server runs on 5173)
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());

// Initialize Socket.io attached to our HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

global.io = io;



// Log websocket connection statuses
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  
  socket.on('run_custom_test', async (data) => {
    const { jobId, inputData, code, language } = data;
    console.log(`[Socket] Custom test requested for Job ${jobId}, Language ${language}`);
    
    // Broadcast compiling status to terminal
    socket.emit(`job-progress:${jobId}`, {
      roundsHistory: [{
        node: 'sandbox',
        round: 0,
        code: code,
        customOutput: '[SYSTEM] Compiling custom test case in Sandbox...'
      }]
    });

    try {
      let result;
      let isFailed = false;
      const { executeCpp } = await import('./executor/cppExecutor.js');
      const execution = await executeCpp(code, [{ input: inputData, expectedOutput: '' }], language);
      const first = execution.results?.[0] || {};
      
      if (!execution.success && !execution.compileSuccess) {
        result = `[COMPILATION ERROR]\n${execution.compileError}`;
        isFailed = true;
      } else if (first.status === 'COMPILE_ERROR') {
        result = `[COMPILATION ERROR]\n${first.error}`;
        isFailed = true;
      } else if (first.status === 'RTE') {
        result = `[RUNTIME ERROR]\n${first.error}`;
        isFailed = true;
      } else if (first.status === 'TLE') {
        result = `[TIMEOUT ERROR]\nExecution timed out.`;
        isFailed = true;
      } else {
        result = `[SUCCESS]\nExecution Time: ${first.timeMs}ms\nOutput:\n${first.actualOutput}`;
      }

      if (isFailed) {
        socket.emit(`job-progress:${jobId}`, {
          roundsHistory: [
            {
              node: 'sandbox',
              round: 0,
              code: code,
              customOutput: result
            },
            {
              node: 'sandbox',
              round: 0,
              code: code,
              customOutput: '⚠️ Custom Test Failed -> Re-triggering Agent Debate'
            }
          ]
        });
      }

      socket.emit(`custom_test_result:${jobId}`, { result, isFailed });

    } catch (err) {
      console.error('[Socket] Error running custom test:', err);
      socket.emit(`custom_test_result:${jobId}`, { result: `[ERROR] Execution failed: ${err.message}`, isFailed: true });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// ----------------------------------------------------
// BULLMQ WORKER EVENT LISTENERS -> WEBSOCKET BROADCAST
// ----------------------------------------------------

// 1. Listen for background progress updates (e.g. at the end of each round)
debateWorker.on('progress', (job, progress) => {
  console.log(`[Socket] Broadcasting progress update for Job ${job.id}`);
  io.emit(`job-progress:${job.id}`, progress);
});

// 2. Listen for job completions
debateWorker.on('completed', (job, result) => {
  console.log(`[Socket] Broadcasting completion for Job ${job.id}`);
  io.emit(`job-completed:${job.id}`, result);
});

// 3. Listen for job failures
debateWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job ? job.id : 'unknown'} failed:`, err);
  if (job) {
    let errorMsg = err.message || String(err);
    if (errorMsg.includes('API key') || errorMsg.includes('API_KEY') || errorMsg.includes('apiKey') || errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('Timeout') || errorMsg.includes('timeout')) {
      errorMsg = 'Execution failed: Check LLM API key / network';
    }
    io.emit(`job-failed:${job.id}`, { error: errorMsg });
  }
});

/**
 * POST /api/debate
 * Accepts problemDescription and problemUrl.
 * Pushes raw parameters directly to BullMQ queue and immediately returns the jobId.
 */
app.post('/api/debate', async (req, res) => {
  try {
    const { problemDescription, problemUrl, maxRounds = 4, jobId, language = 'cpp', coderPrompt, criticPrompt, refinerPrompt } = req.body;
    const maxRoundsClamped = Math.min(Number(maxRounds) || 4, 4);

    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required for real-time tracking.' });
    }

    // Add debate job to queue with a custom client-generated jobId
    // Pass raw inputs to be processed asynchronously inside the background worker
    const job = await debateQueue.add(
      'debateJob',
      { 
        problemDescription: problemDescription || '', 
        problemUrl: problemUrl || '',
        maxRounds: maxRoundsClamped, 
        language, 
        coderPrompt, 
        criticPrompt, 
        refinerPrompt 
      },
      { jobId } // Instructs BullMQ to use the client-generated ID
    );

    console.log(`[API] Enqueued Job ${job.id} for debate.`);
    return res.status(200).json({ jobId: job.id });

  } catch (err) {
    console.error('[API] Error submitting debate job:', err);
    return res.status(500).json({ error: err.message || 'Failed to submit debate job.' });
  }
});

/**
 * GET /api/debate/:jobId
 * Fetches the current state, progress, and results of a job.
 * Helps the client recover state if the browser page is refreshed.
 */
app.get('/api/debate/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await debateQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const state = await job.getState();
    const progress = job.progress;
    const result = job.returnvalue;

    return res.json({
      jobId: job.id,
      state,
      progress,
      result
    });

  } catch (err) {
    console.error('[API] Error fetching job status:', err);
    return res.status(500).json({ error: 'Internal Server Error.' });
  }
});

// Start the server on port 5000
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`AlgoDebate AI Backend Server running at:`);
  console.log(`http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});
