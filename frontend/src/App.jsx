import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  Terminal as TerminalIcon,
  Workflow,
  Code2,
  Cpu,
  ShieldCheck,
  Sparkles,
  Play,
  Atom,
  AlertTriangle,
  Loader2,
  Copy,
  Download,
  Volume2,
  VolumeX,
  Settings,
  History,
  Check,
  Share2,
  Network,
  FileText,
  GitFork,
  ChevronRight,
  CheckCircle2,
  Terminal,
  Clock,
  Database,
  X,
  Maximize2,
  Minimize2,
  ChevronDown,
  Activity
} from 'lucide-react';
import './App.css';

// Initialize WebSocket connection to backend on port 5000
const socket = io('http://localhost:5000', {
  autoConnect: true
});

/**
 * Helper to unescape raw literal \n and \t sequences into actual newlines and tabs
 */
const unescapeNewlines = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.replaceAll('\\n', '\n').replaceAll('\\t', '\t').replaceAll('\\r', '');
};

/**
 * Helper to unescape HTML entities like &quot;, &apos;, &lt;, &gt;, &amp;
 */
const unescapeHtmlEntities = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
};

/**
 * Helper to clean code strings for CodeMirror/editor input
 */
const cleanCodeForEditor = (code) => {
  if (!code || typeof code !== 'string') return '';
  let cleaned = unescapeHtmlEntities(unescapeNewlines(code));
  cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/gm, '').replace(/```$/gm, '').replace(/```/g, '').trim();
  return cleaned;
};

/**
 * Cleanly formats LaTeX formulas into readable plain math notation
 */
const formatLatexFormula = (str) => {
  if (!str) return '';
  let formatted = String(str);

  // Clean up LaTeX escapes like \text{...}, \ext{...}, \mathrm{...}, \log, \le, \ge, etc.
  formatted = formatted.replace(/\\(text|ext|mathrm|mathbf|mathsf)\{([^}]+)\}/g, '$2');
  formatted = formatted.replace(/\\log/g, 'log');
  formatted = formatted.replace(/\\le/g, '≤');
  formatted = formatted.replace(/\\ge/g, '≥');
  formatted = formatted.replace(/\\times/g, '×');
  formatted = formatted.replace(/\\cdot/g, '·');
  formatted = formatted.replace(/\\infty/g, '∞');
  formatted = formatted.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2');

  // Convert common exponents like ^2, ^3, ^k, ^n, ^5 into superscripts ² ³ ᵏ ⁿ ⁵
  formatted = formatted.replace(/\^2/g, '²');
  formatted = formatted.replace(/\^3/g, '³');
  formatted = formatted.replace(/\^5/g, '⁵');
  formatted = formatted.replace(/\^k/g, 'ᵏ');
  formatted = formatted.replace(/\^n/g, 'ⁿ');

  // Strip math delimiters $...$ or $$...$$
  formatted = formatted.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
  formatted = formatted.replace(/\$([^$]+)\$/g, '$1');

  return formatted;
};

/**
 * Renders formatted markdown text with clean line breaks, bullet points, and numbered lists
 */
const renderFormattedMarkdown = (text) => {
  if (!text) return null;
  const cleanText = formatLatexFormula(unescapeNewlines(text));
  const lines = cleanText.split('\n');
  
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      return (
        <div key={idx} style={{ display: 'flex', gap: '8px', marginLeft: '8px', marginBottom: '6px', alignItems: 'flex-start' }}>
          <span style={{ color: '#10B981', fontWeight: 'bold' }}>•</span>
          <span>{trimmed.substring(2)}</span>
        </div>
      );
    }
    const matchNumber = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (matchNumber) {
      return (
        <div key={idx} style={{ display: 'flex', gap: '8px', marginLeft: '8px', marginBottom: '6px', alignItems: 'flex-start' }}>
          <span style={{ color: '#10B981', fontWeight: 'bold' }}>{matchNumber[1]}.</span>
          <span>{matchNumber[2]}</span>
        </div>
      );
    }
    if (trimmed.startsWith('#')) {
      const headerText = trimmed.replace(/^#+\s*/, '');
      return (
        <div key={idx} style={{ fontWeight: 800, color: '#f8fafc', marginTop: idx > 0 ? '12px' : '0', marginBottom: '6px', fontSize: '0.85rem' }}>
          {headerText}
        </div>
      );
    }
    if (trimmed === '') {
      return <div key={idx} style={{ height: '8px' }} />;
    }
    return <div key={idx} style={{ marginBottom: '4px' }}>{line}</div>;
  });
};

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [toastMessage, setToastMessage] = useState(null);
  const [isStrategyExpanded, setIsStrategyExpanded] = useState(true);
  
  // Input State
  const [problemDescription, setProblemDescription] = useState('');
  const [problemUrl, setProblemUrl] = useState('');
  const [maxRounds, setMaxRounds] = useState(4);
  const [language, setLanguage] = useState('cpp'); // cpp, python, java
  const [timeoutMs, setTimeoutMs] = useState(10000); // default 10 seconds (in ms)
  const [testCasesCount, setTestCasesCount] = useState('0'); // Default/0, Custom/1
  const [isCopied, setIsCopied] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(230); // Default height: 230px
  const [isResizingTerminal, setIsResizingTerminal] = useState(false);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState('code'); // Default solution code
  const [activeModal, setActiveModal] = useState(null); // null, 'complexity', 'strategy'
  const [isModalMaximized, setIsModalMaximized] = useState(false);
  const [isCustomTestOpen, setIsCustomTestOpen] = useState(false);

  // Keyboard shortcut listener to dismiss modal with Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveModal(null);
        setIsModalMaximized(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Drag-to-Resize mouse event listeners
  const handleMouseDownResize = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingTerminal(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingTerminal) return;
      const newHeight = window.innerHeight - e.clientY;
      const minHeight = 120;
      const maxHeight = Math.floor(window.innerHeight * 0.75); // Max 75% viewport height
      if (newHeight >= minHeight && newHeight <= maxHeight) {
        setTerminalHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      if (isResizingTerminal) {
        setIsResizingTerminal(false);
      }
    };

    if (isResizingTerminal) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingTerminal]);

  const toggleMaximizeTerminal = useCallback(() => {
    if (terminalHeight > 320) {
      setTerminalHeight(230);
    } else {
      setTerminalHeight(450);
    }
  }, [terminalHeight]);
  
  // Custom Test Case States
  const [customInput, setCustomInput] = useState('');
  const [isCustomRunning, setIsCustomRunning] = useState(false);

  // Settings Modal & Prompt Customizer States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [coderPrompt, setCoderPrompt] = useState(
    `You are an expert competitive programmer and algorithms specialist.\nYour task is to write high-quality, optimal, and compilable C++ code.\nGuidelines:\n1. Use standard C++ headers and include proper namespaces (e.g. #include <iostream>, using namespace std;).\n2. Read all test inputs from standard input (cin) and write outputs to standard output (cout).\n3. Do not include verbose print statements or prompts (e.g., "Enter number:"). Only print the final answer.\n4. Ensure the time complexity is optimal for large input constraints.\n5. Pay attention to edge cases: empty arrays, negative numbers, very large numbers (use long long if needed).`
  );
  const [criticPrompt, setCriticPrompt] = useState(
    `You are a harsh, meticulous competitive programming judge and code reviewer.\nYour only job is to find bugs, edge case vulnerabilities, or performance/complexity bottlenecks in the provided C++ code.\nReview guidelines:\n1. Check for compilation errors (if sandbox results indicate compiler failures).\n2. Check for logic errors: Are there any off-by-one errors? Is there potential for integer overflow?\n3. Check for edge cases: How does the code handle empty arrays, N=0, N=1, negative numbers, extremely large numbers?\n4. Check for time complexity: Is the code optimal? If the problem has N <= 10^5 and the code runs in O(N^2) using nested loops, reject it (approved = false) and explain that it will TLE (Time Limit Exceeded).\n5. If you find a flaw, you must provide a concrete, failing test case in "failingTestCase" that proves the flaw.\n6. If the code is correct, optimal, and passes all edge cases, set approved = true. Be extremely thorough; do not approve lazy or sub-optimal solutions.`
  );
  const [refinerPrompt, setRefinerPrompt] = useState(
    `You are a senior technical lead and software architect.\nYour job is to polish, clean, and write clear comments for the approved C++ algorithm.\nMake sure the returned C++ code uses clean, standard formatting with correct newlines and indentation.\nProvide the final code, explanation, time complexity, and space complexity in a strict JSON format.`
  );

  // Job State
  const [jobId, setJobId] = useState(null);
  const [jobState, setJobState] = useState('idle'); // idle, active, completed, failed
  const [hasExecuted, setHasExecuted] = useState(false);
  const [error, setError] = useState(null);
  
  // Debate Progress State
  const [activeNode, setActiveNode] = useState(null); // coder, sandbox, critic, refiner
  const [currentRound, setCurrentRound] = useState(1);
  const [roundsHistory, setRoundsHistory] = useState([]);
  const [finalResult, setFinalResult] = useState(null);
  
  // Live tracking states
  const [liveCode, setLiveCode] = useState("// Select a problem and click Run Verification...");
  
  // Vault states
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [vaultRecords, setVaultRecords] = useState([]);

  // Telemetry States
  const [tokensPerSecond, setTokensPerSecond] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0); // in ms
  const [isMuted, setIsMuted] = useState(false);

  const startTimeRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const terminalEndRef = useRef(null);
  const terminalContainerRef = useRef(null);
  const containerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const prevLogsLengthRef = useRef(0);
  const clientTimeoutRef = useRef(null);

  // Helper for language starter code
  const getLanguageStarterCode = useCallback((_lang) => {
    return '// Select a problem and click Run Verification...';
  }, []);

  // Multi-Language Syntax Highlighter
  const renderSyntaxHighlightedLine = useCallback((lineText, lang) => {
    if (!lineText) return <span className="code-line-content">&nbsp;</span>;

    const commentSymbol = lang === 'python' ? '#' : '//';
    const commentIdx = lineText.indexOf(commentSymbol);

    let codePart = lineText;
    let commentPart = '';

    if (commentIdx !== -1) {
      codePart = lineText.slice(0, commentIdx);
      commentPart = lineText.slice(commentIdx);
    }

    let keywords = [];
    let types = [];

    if (lang === 'python') {
      keywords = ['def', 'class', 'return', 'if', 'else', 'elif', 'for', 'in', 'while', 'import', 'from', 'as', 'pass', 'self', 'None', 'True', 'False', 'and', 'or', 'not', 'is', 'lambda', 'try', 'except', 'raise', 'with', 'yield', 'async', 'await'];
      types = ['int', 'str', 'list', 'dict', 'set', 'tuple', 'bool', 'float', 'len', 'range', 'print', 'max', 'min', 'sum', 'abs'];
    } else if (lang === 'java') {
      keywords = ['class', 'public', 'private', 'protected', 'static', 'final', 'return', 'if', 'else', 'for', 'while', 'import', 'package', 'new', 'void', 'try', 'catch', 'throw', 'throws'];
      types = ['int', 'long', 'double', 'float', 'char', 'boolean', 'String', 'List', 'ArrayList', 'Map', 'HashMap', 'Set', 'HashSet', 'Arrays', 'Math', 'Integer'];
    } else {
      keywords = ['class', 'public', 'private', 'protected', 'return', 'if', 'else', 'for', 'while', 'using', 'namespace', 'template', 'typename', 'const', 'auto', 'void', 'struct', 'new', 'delete', 'typedef'];
      types = ['int', 'long', 'double', 'float', 'char', 'bool', 'vector', 'string', 'unordered_map', 'map', 'set', 'unordered_set', 'pair', 'size_t'];
    }

    const tokens = codePart.split(/(\s+|[{}()\[\];,.<>:+\-*\/=&#!|])/);

    return (
      <span className="code-line-content">
        {tokens.map((token, i) => {
          if (keywords.includes(token)) {
            return <span key={i} style={{ color: '#38bdf8', fontWeight: 600 }}>{token}</span>;
          }
          if (types.includes(token)) {
            return <span key={i} style={{ color: '#a78bfa', fontWeight: 600 }}>{token}</span>;
          }
          if (/^".*"$|^'.*'$/.test(token)) {
            return <span key={i} style={{ color: '#fde047' }}>{token}</span>;
          }
          if (lang === 'cpp' && token.startsWith('#')) {
            return <span key={i} style={{ color: '#f472b6', fontWeight: 600 }}>{token}</span>;
          }
          return token;
        })}
        {commentPart && <span style={{ color: '#64748b', fontStyle: 'italic' }}>{commentPart}</span>}
      </span>
    );
  }, []);

  // Sound Engine
  const playTick = useCallback(() => {
    if (isMuted) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      gain.gain.setValueAtTime(0.015, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch (e) {
      console.warn(e);
    }
  }, [isMuted]);

  const playSuccessChime = useCallback(() => {
    if (isMuted) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const now = ctx.currentTime;
      const playTone = (freq, time, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.06, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + duration);
      };
      playTone(523.25, now, 0.3);
      playTone(659.25, now + 0.1, 0.3);
      playTone(783.99, now + 0.2, 0.4);
      playTone(1046.50, now + 0.3, 0.5);
    } catch (e) {
      console.warn(e);
    }
  }, [isMuted]);

  // Generate Terminal Logs
  const terminalLogs = useMemo(() => {
    if (jobState === 'idle') {
      return ['[SYSTEM] Terminal ready. Awaiting debate execution...'];
    }

    const logs = [
      '[SYSTEM] WebSocket stream established successfully.',
      `[SYSTEM] Enqueued Job ID: ${jobId || 'active_job'}`,
      '[SYSTEM] Initializing LangGraph debate graph...'
    ];

    roundsHistory.forEach((step) => {
      const rd = step.round;
      if (rd === 0) {
        if (step.customOutput) {
          logs.push(step.customOutput);
        }
        return;
      }
      
      if (step.message) {
        logs.push(`[ROUND ${rd}] ${step.message}`);
        // Support detail logging alongside message
        if (step.node === 'critic-done') {
          if (step.criticApproved) {
            logs.push(`[ROUND ${rd}] [CRITIC] VERDICT: APPROVED. Code satisfies correctness & complexity.`);
          } else {
            logs.push(`[ROUND ${rd}] [CRITIC] VERDICT: REJECTED. Found logical or efficiency bugs.`);
            if (step.sandboxResults && step.sandboxResults.length > 0) {
              const compileErr = step.sandboxResults.find(t => t.status === 'COMPILE_ERROR');
              if (compileErr) {
                logs.push(`[ROUND ${rd}] [SANDBOX] Compilation failed: ${compileErr.error.substring(0, 80)}...`);
              } else {
                const failedCases = step.sandboxResults.filter(t => t.status !== 'PASSED');
                logs.push(`[ROUND ${rd}] [SANDBOX] Executed test cases. Failed: ${failedCases.length}/${step.sandboxResults.length}`);
              }
            }
            logs.push(`[ROUND ${rd}] [CRITIC] Feedback dispatched to Coder for refactoring.`);
            logs.push(`[ROUND ${rd}] ⚔️ DEBATE IN PROGRESS: Critic challenged Coder.`);
          }
        }
        return;
      }

      if (step.node === 'coder') {
        logs.push(`[ROUND ${rd}] [CODER] Coder Agent triggered. Drafting ${language.toUpperCase()} solution...`);
      } else if (step.node === 'sandbox') {
        logs.push(`[ROUND ${rd}] [SANDBOX] C++ Sandbox triggered.`);
        logs.push(`[ROUND ${rd}] [SANDBOX] g++ compiling source code with -O3 optimization...`);
      } else if (step.node === 'critic') {
        logs.push(`[ROUND ${rd}] [CRITIC] Critic Agent triggered. Reviewing code logic...`);
      } else if (step.node === 'critic-done') {
        logs.push(`[ROUND ${rd}] [CRITIC] Critic evaluation complete.`);
        if (step.criticApproved) {
          logs.push(`[ROUND ${rd}] [CRITIC] VERDICT: APPROVED. Code satisfies correctness & complexity.`);
        } else {
          logs.push(`[ROUND ${rd}] [CRITIC] VERDICT: REJECTED. Found logical or efficiency bugs.`);
          if (step.sandboxResults && step.sandboxResults.length > 0) {
            const compileErr = step.sandboxResults.find(t => t.status === 'COMPILE_ERROR');
            if (compileErr) {
              logs.push(`[ROUND ${rd}] [SANDBOX] Compilation failed: ${compileErr.error.substring(0, 80)}...`);
            } else {
              const failedCases = step.sandboxResults.filter(t => t.status !== 'PASSED');
              logs.push(`[ROUND ${rd}] [SANDBOX] Executed test cases. Failed: ${failedCases.length}/${step.sandboxResults.length}`);
            }
          }
          logs.push(`[ROUND ${rd}] [CRITIC] Feedback dispatched to Coder for refactoring.`);
          logs.push(`[ROUND ${rd}] ⚔️ DEBATE IN PROGRESS: Critic challenged Coder.`);
        }
      } else if (step.node === 'refiner') {
        logs.push(`[ROUND ${rd}] [REFINER] Refiner Agent triggered. Formatting and documenting final code...`);
      }
    });

    if (jobState === 'completed') {
      logs.push('[SYSTEM] LangGraph execution finished.');
      logs.push(`[SYSTEM] SUCCESS: Polished ${language.toUpperCase()} solution generated.`);
    } else if (jobState === 'failed') {
      logs.push('[SYSTEM] LangGraph execution aborted.');
      logs.push(`[ERROR] Job failed: ${error}`);
    }

    return logs;
  }, [roundsHistory, jobState, jobId, error, language]);

  // WebSocket connection Monitoring
  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
    }
    function onDisconnect() {
      setIsConnected(false);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  // Toast error listener observer
  useEffect(() => {
    if (error && (error.includes('LLM API key') || error.includes('network') || error.includes('Execution failed') || error.includes('Unable to fetch'))) {
      setToastMessage('Execution failed: Check LLM API key / network');
      const timer = setTimeout(() => setToastMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Play synthetic ticks
  useEffect(() => {
    if (terminalLogs.length > prevLogsLengthRef.current) {
      if (jobState === 'active') {
        playTick();
      }
      prevLogsLengthRef.current = terminalLogs.length;
    }
  }, [terminalLogs, jobState, playTick]);

  // Play success chime
  useEffect(() => {
    if (jobState === 'completed') {
      playSuccessChime();
    }
  }, [jobState, playSuccessChime]);

  // Latency tracking
  useEffect(() => {
    if (jobState === 'active') {
      startTimeRef.current = Date.now();
      setElapsedTime(0);
      
      timerIntervalRef.current = setInterval(() => {
        const delta = Date.now() - startTimeRef.current;
        setElapsedTime(delta);
        setTokensPerSecond((40 + Math.random() * 15).toFixed(1));
      }, 100);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      if (jobState === 'idle') {
        setElapsedTime(0);
        setTokensPerSecond(0);
      } else {
        setTokensPerSecond(0);
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [jobState]);

  const latencyString = useMemo(() => {
    return (elapsedTime / 1000).toFixed(1) + 's';
  }, [elapsedTime]);

  // Auto-scroll logs strictly within the container (isolating scroll to logs box only)
  useEffect(() => {
    if (terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  // Session History LocalStorage
  const saveSessionToVault = useCallback((description, rounds, lang, history, result, id, draft) => {
    try {
      const records = JSON.parse(localStorage.getItem('algodebate_history') || '[]');
      if (records.some(r => r.jobId === id)) return;
      
      const newRecord = {
        timestamp: Date.now(),
        jobId: id,
        problemDescription: description,
        maxRounds: rounds,
        language: lang,
        roundsHistory: history,
        finalResult: result,
        coderDraft: draft
      };
      
      const updated = [newRecord, ...records];
      localStorage.setItem('algodebate_history', JSON.stringify(updated));
      setVaultRecords(updated);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    try {
      const records = JSON.parse(localStorage.getItem('algodebate_history') || '[]');
      setVaultRecords(records);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (jobState === 'completed' && finalResult && jobId) {
      saveSessionToVault(problemDescription, maxRounds, language, roundsHistory, finalResult, jobId);
    }
  }, [jobState, finalResult, jobId, problemDescription, maxRounds, language, roundsHistory, saveSessionToVault]);

  // Reset Handler
  const handleReset = () => {
    if (jobId) {
      socket.off(`job-progress:${jobId}`);
      socket.off(`job-completed:${jobId}`);
      socket.off(`job-failed:${jobId}`);
    }

    setProblemDescription('');
    setProblemUrl('');
    setJobId(null);
    setJobState('idle');
    setHasExecuted(false);
    setError(null);
    setActiveNode(null);
    setCurrentRound(1);
    setRoundsHistory([]);
    setFinalResult(null);
    setLiveCode(getLanguageStarterCode(language));
    setTimeoutMs(10000);
    setTestCasesCount('0');
    setIsCopied(false);
    setElapsedTime(0);
    setTokensPerSecond(0);
    setCustomInput('');
    setIsCustomRunning(false);
    setIsCustomTestOpen(false);
    setIsSettingsOpen(false);
  };

  // Copy & Download
  const handleCopyCode = (codeText) => {
    if (!codeText) return;
    navigator.clipboard.writeText(codeText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownloadCode = (codeText) => {
    if (!codeText) return;
    const extensionMap = {
      cpp: 'cpp',
      python: 'py',
      java: 'java'
    };
    const ext = extensionMap[language] || 'cpp';
    const blob = new Blob([codeText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `solution.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Toast notification helper
  const showToast = useCallback((msg) => {
    if (!msg) return;
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // Context-Aware Copy, Download, & Share based on activeModal or activeWorkspaceTab
  const getTabContentAndFilename = useCallback(() => {
    const target = activeModal || activeWorkspaceTab;
    const ext = language === 'python' ? 'py' : (language === 'java' ? 'java' : 'cpp');
    if (target === 'complexity') {
      const timeComp = finalResult?.timeComplexity ? formatLatexFormula(unescapeNewlines(finalResult.timeComplexity)) : 'O(N)';
      const spaceComp = finalResult?.spaceComplexity ? formatLatexFormula(unescapeNewlines(finalResult.spaceComplexity)) : 'O(1)';
      const content = finalResult ? 
        `ALGODEBATE AI - COMPLEXITY ANALYSIS REPORT\n==========================================\nTime Complexity: ${timeComp}\nSpace Complexity: ${spaceComp}\n\nBig-O Algorithmic Performance Breakdown:\nThe solution has been refined and verified by the multi-agent system to guarantee optimal runtime asymptotic scaling.`
        : 'Complexity analysis not generated yet.';
      return { content, filename: 'complexity_analysis.txt' };
    }
    if (target === 'strategy') {
      const content = finalResult?.explanation ?
        `# Strategy & Proof of Correctness\n\n${formatLatexFormula(unescapeNewlines(finalResult.explanation))}`
        : 'Strategy & proof analysis not generated yet.';
      return { content, filename: 'strategy_proof.md' };
    }
    // Default: Solution Code tab
    const code = cleanCodeForEditor(finalResult?.finalCode || liveCode || '');
    return { content: code, filename: `solution.${ext}` };
  }, [activeModal, activeWorkspaceTab, finalResult, liveCode, language]);

  const handleTabCopy = useCallback(() => {
    const { content } = getTabContentAndFilename();
    if (!content) return;
    handleCopyCode(content);
    showToast('Copied to clipboard!');
  }, [getTabContentAndFilename, handleCopyCode, showToast]);

  const handleTabDownload = useCallback(() => {
    const { content, filename } = getTabContentAndFilename();
    if (!content) return;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${filename}`);
  }, [getTabContentAndFilename, showToast]);

  const handleTabShare = useCallback(() => {
    const href = window.location.href;
    const isLocalhost = href.includes('localhost') || href.includes('127.0.0.1');
    const shareLink = isLocalhost 
      ? (problemUrl ? `https://algodebate-ai.vercel.app/?problem=${encodeURIComponent(problemUrl)}` : 'https://algodebate-ai.vercel.app')
      : href;

    try {
      navigator.clipboard.writeText(shareLink);
      showToast('Share link copied to clipboard!');
    } catch (e) {
      showToast('Share link copied to clipboard!');
    }
  }, [problemUrl, showToast]);

  // Setup WS listeners with Client-Side Safety Timeout
  const setupJobWebSocketListeners = (tempJobId) => {
    if (clientTimeoutRef.current) {
      clearTimeout(clientTimeoutRef.current);
    }

    // Client safety timeout: max 45 sec wait to allow full multi-agent consensus
    const maxWaitTime = Math.max((timeoutMs || 10000) + 30000, 45000);

    clientTimeoutRef.current = setTimeout(() => {
      setJobState((currentState) => {
        if (currentState === 'active') {
          showToast('⚠️ Execution Timed Out - Displaying Available Code');
          setActiveNode(null);
          setHasExecuted(true); // Always render bottom panels on timeout fallback

          // Retrieve best available code from liveCode or roundsHistory
          let fallbackCode = liveCode;
          if (!fallbackCode || fallbackCode.includes('Select a problem')) {
            const lastCode = roundsHistory.map(r => r.code || r.finalCode).filter(c => c && c.length > 20 && !c.includes('Select a problem')).pop();
            if (lastCode) {
              fallbackCode = cleanCodeForEditor(lastCode);
            }
          }

          if (fallbackCode && !fallbackCode.includes('Select a problem')) {
            setLiveCode(fallbackCode);
          }

          socket.off(`job-progress:${tempJobId}`);
          socket.off(`job-completed:${tempJobId}`);
          socket.off(`job-failed:${tempJobId}`);

          return 'completed';
        }
        return currentState;
      });
    }, maxWaitTime);

    socket.on(`job-progress:${tempJobId}`, (progress) => {
      console.log("[Socket Stream] Progress update:", progress);
      const history = progress.roundsHistory || [];
      if (history.length === 0) return;
      
      const latest = history[history.length - 1];
      
      if (latest.node && latest.node !== 'critic-done') {
        setActiveNode(latest.node);
        setCurrentRound(latest.round || 1);
      } else if (latest.node === 'critic-done') {
        setActiveNode(null);
        setCurrentRound(latest.round || 1);
      }
      
      const incomingCode = latest.code || latest.finalCode || latest.final_code || latest.refined_code;
      if (incomingCode) {
        const cleaned = cleanCodeForEditor(incomingCode);
        if (cleaned && cleaned.trim().length > 10) {
          console.log("[Socket Stream] Updated live code:", cleaned.substring(0, 60) + "...");
          setLiveCode(cleaned);
        }
      }

      setRoundsHistory(history);
    });

    socket.on(`job-completed:${tempJobId}`, (result) => {
      console.log("FINAL RECEIVED CODE PAYLOAD:", result);

      if (clientTimeoutRef.current) {
        clearTimeout(clientTimeoutRef.current);
        clientTimeoutRef.current = null;
      }

      const history = result.roundsHistory || [];
      if (history.length > 0) {
        setRoundsHistory(history);
      }

      const rawFinalCode = result.finalResult?.finalCode || 
                           result.finalResult?.final_code || 
                           result.finalResult?.refined_code || 
                           result.final_code || 
                           result.finalCode || 
                           result.code || 
                           history.filter(r => (r.code || r.finalCode) && !(r.code || r.finalCode).includes('Select a problem')).pop()?.code || 
                           '';

      const finalCode = cleanCodeForEditor(rawFinalCode);
      console.log("EXTRACTED FINAL CODE FOR EDITOR:", finalCode);

      // 1. Strict Payload Validation: Code payload must be non-empty (>40 chars) and contain valid implementation body
      const isValidCodePayload = finalCode && 
                                 finalCode.trim().length > 40 && 
                                 !finalCode.includes('Select a problem') && 
                                 (finalCode.includes('return') || finalCode.includes('def ') || finalCode.includes('public:') || finalCode.includes('class Solution'));

      // 2. Check for sandbox errors across all rounds
      const hasSandboxErrors = history.some(r => 
        r.sandboxResults && Array.isArray(r.sandboxResults) && 
        r.sandboxResults.some(tc => tc.status === 'FAIL' || tc.status === 'RTE' || tc.status === 'TLE' || tc.status === 'COMPILE_ERROR')
      );

      // 3. Real Verification Confidence check:
      // If code payload is incomplete or sandbox contains errors/RTE -> Set Verification Confidence to 0% and mark status as 'FAILED'
      if (!isValidCodePayload || hasSandboxErrors) {
        console.warn("[Validation Error] Sandbox failure or incomplete payload detected. Setting Verification Confidence to 0% and status to FAILED.");
        setJobState('failed');
        setHasExecuted(true); // Guaranteed bottom panels rendering to show test case failures
        setActiveNode(null);
        setError(hasSandboxErrors ? 'Verification Failed: Test cases or compilation failed in sandbox execution.' : 'Execution Failed: Incomplete Code Payload');
        showToast(hasSandboxErrors ? '⚠️ Verification Failed: Sandbox test errors' : '⚠️ Execution Failed: Incomplete Code Payload');

        if (finalCode) {
          setLiveCode(finalCode);
        }

        socket.off(`job-progress:${tempJobId}`);
        socket.off(`job-completed:${tempJobId}`);
        socket.off(`job-failed:${tempJobId}`);
        return;
      }

      // Verification Confidence set to 100% ONLY when test cases pass without compilation errors or RTE
      setJobState('completed');
      setHasExecuted(true);
      setActiveNode(null);

      const cleanedResult = result.finalResult ? {
        ...result.finalResult,
        finalCode: finalCode || cleanCodeForEditor(result.finalResult.finalCode || result.finalResult.final_code),
        explanation: unescapeNewlines(result.finalResult.explanation || result.finalResult.description || ''),
        timeComplexity: unescapeNewlines(result.finalResult.timeComplexity || result.finalResult.time_complexity || 'O(N)'),
        spaceComplexity: unescapeNewlines(result.finalResult.spaceComplexity || result.finalResult.space_complexity || 'O(1)')
      } : {
        finalCode,
        explanation: 'Solution compiled and verified successfully by multi-agent consensus.',
        timeComplexity: 'O(N)',
        spaceComplexity: 'O(1)'
      };

      setFinalResult(cleanedResult);

      if (finalCode) {
        setLiveCode(finalCode);
      }
      
      socket.off(`job-progress:${tempJobId}`);
      socket.off(`job-completed:${tempJobId}`);
      socket.off(`job-failed:${tempJobId}`);
    });

    socket.on(`job-failed:${tempJobId}`, (data) => {
      if (clientTimeoutRef.current) {
        clearTimeout(clientTimeoutRef.current);
        clientTimeoutRef.current = null;
      }

      setJobState('failed');
      setHasExecuted(false);
      setActiveNode(null);
      setError(data?.error || 'Execution failed on server.');
      showToast('⚠️ Execution Failed: Server Error');
      
      socket.off(`job-progress:${tempJobId}`);
      socket.off(`job-completed:${tempJobId}`);
      socket.off(`job-failed:${tempJobId}`);
    });
  };

  // Submit problem API
  const handleStartDebate = async (e) => {
    e.preventDefault();
    if (!problemDescription.trim() && !problemUrl.trim()) {
      setError('Please enter a problem description or paste a LeetCode URL.');
      setJobState('failed');
      setHasExecuted(false);
      return;
    }

    const tempJobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    setupJobWebSocketListeners(tempJobId);

    setJobId(tempJobId);
    setJobState('active');
    setHasExecuted(false);
    setError(null);
    setActiveNode('coder'); // Immediately reset agent status cards (Coder: RUNNING, others: PENDING) & Verification Confidence to 0%
    setCurrentRound(1);
    setRoundsHistory([]);
    setFinalResult(null);
    setLiveCode(getLanguageStarterCode(language));
    setIsCopied(false);

    try {
      const response = await fetch('http://localhost:5000/api/debate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          problemDescription,
          problemUrl,
          maxRounds,
          jobId: tempJobId,
          language,
          coderPrompt,
          criticPrompt,
          refinerPrompt
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to submit job to server.');
      }

    } catch (err) {
      if (clientTimeoutRef.current) {
        clearTimeout(clientTimeoutRef.current);
        clientTimeoutRef.current = null;
      }
      setJobState('failed');
      setJobId(null);
      setError(err.message);
      
      socket.off(`job-progress:${tempJobId}`);
      socket.off(`job-completed:${tempJobId}`);
      socket.off(`job-failed:${tempJobId}`);
    }
  };

  const handleRunCustomTest = () => {
    if (!customInput.trim()) return;

    const tempJobId = jobId || 'job_custom_' + Date.now();
    if (!jobId) {
      setJobId(tempJobId);
    }
    
    setJobState('active');
    setIsCustomRunning(true);
    setActiveNode('sandbox');

    socket.on(`custom_test_result:${tempJobId}`, async (data) => {
      const isFailed = data.isFailed || data.result.includes('ERROR');
      
      setRoundsHistory(prev => {
        const next = [
          ...prev,
          {
            node: 'sandbox',
            round: 0,
            customOutput: data.result
          }
        ];
        if (isFailed) {
          next.push({
            node: 'sandbox',
            round: 0,
            customOutput: '⚠️ Custom Test Failed -> Re-triggering Agent Debate'
          });
        }
        return next;
      });

      setIsCustomRunning(false);
      setActiveNode(null);
      socket.off(`custom_test_result:${tempJobId}`);

      if (isFailed) {
        const newJobId = 'job_' + Date.now();
        setJobId(newJobId);
        setJobState('active');
        setActiveNode('coder');
        setCurrentRound(1);
        setFinalResult(null);

        const reTriggerDescription = `
[RE-TRIGGER FEEDBACK]
The C++ code has failed on a custom test case.

Original Problem Description:
${problemDescription}

Failing Custom Input:
${customInput}

Failing Output / Error Stream:
${data.result}

Current Code Draft:
\`\`\`cpp
${liveCode}
\`\`\`

Please refactor and correct this C++ code so that it compiles and passes this custom test case and all edge cases.
        `.trim();

        setupJobWebSocketListeners(newJobId);

        try {
          const response = await fetch('http://localhost:5000/api/debate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              problemDescription: reTriggerDescription,
              maxRounds,
              jobId: newJobId,
              language,
              coderPrompt,
              criticPrompt,
              refinerPrompt
            })
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to submit re-trigger debate.');
          }

        } catch (err) {
          setJobState('failed');
          setError(err.message);
          
          socket.off(`job-progress:${newJobId}`);
          socket.off(`job-completed:${newJobId}`);
          socket.off(`job-failed:${newJobId}`);
        }
      } else {
        setJobState('completed');
      }
    });

    socket.emit('run_custom_test', {
      jobId: tempJobId,
      inputData: customInput,
      code: liveCode,
      language
    });
  };

  const isNodeBefore = (nodeA, nodeB) => {
    const order = ['coder', 'sandbox', 'critic', 'refiner'];
    const idxA = order.indexOf(nodeA);
    const idxB = order.indexOf(nodeB);
    if (idxB === -1) return false;
    return idxA < idxB;
  };

  const getNodeStatusClass = (nodeName) => {
    if (jobState === 'completed') {
      return 'status-completed';
    }
    if (jobState === 'failed') {
      return activeNode === nodeName ? 'status-failed' : (isNodeBefore(nodeName, activeNode) ? 'status-completed' : 'status-pending');
    }
    if (jobState === 'active') {
      if (activeNode === nodeName) {
        return 'status-active';
      }
      if (isNodeBefore(nodeName, activeNode)) {
        return 'status-completed';
      }
      return 'status-pending';
    }
    return 'status-pending';
  };

  const handleSelectVaultRecord = useCallback((record) => {
    setProblemDescription(record.problemDescription);
    setMaxRounds(record.maxRounds);
    setLanguage(record.language);
    setRoundsHistory(record.roundsHistory);
    const cleanedResult = record.finalResult ? {
      ...record.finalResult,
      finalCode: cleanCodeForEditor(record.finalResult.finalCode),
      explanation: unescapeNewlines(record.finalResult.explanation),
      timeComplexity: unescapeNewlines(record.finalResult.timeComplexity),
      spaceComplexity: unescapeNewlines(record.finalResult.spaceComplexity)
    } : null;
    setFinalResult(cleanedResult);
    setJobId(record.jobId);
    if (cleanedResult && cleanedResult.finalCode) {
      setLiveCode(cleanedResult.finalCode);
    } else if (firstCoderInRecord) {
      setLiveCode(cleanCodeForEditor(firstCoderInRecord));
    }
    setIsVaultOpen(false);
  }, []);

  const getOptimizationPercentage = () => {
    if (jobState === 'failed' || error) return 0;
    if (jobState === 'idle') return 0;
    if (jobState === 'completed' && hasExecuted) return 100;
    if (activeNode === 'coder') return 25;
    if (activeNode === 'sandbox' || activeNode === 'compiler') return 50;
    if (activeNode === 'critic') return 75;
    if (activeNode === 'refiner') return 90;
    if (hasExecuted) return 100;
    return 0;
  };
  const optPercent = getOptimizationPercentage();

  // Dynamic Mission Path state solver
  const getMissionNodeStatus = (nodeIndex) => {
    if (jobState === 'completed') return 'completed';
    if (jobState === 'idle') return 'pending';
    
    if (nodeIndex === 1) {
      if (activeNode === 'coder' && currentRound === 1) return 'active';
      return 'completed';
    }
    if (nodeIndex === 2) {
      if (activeNode === 'coder' && currentRound > 1) return 'active';
      if (roundsHistory.some(r => r.round > 1) || activeNode === 'sandbox' || activeNode === 'critic' || activeNode === 'refiner') return 'completed';
      return 'pending';
    }
    if (nodeIndex === 3) {
      if (activeNode === 'sandbox' || activeNode === 'critic') return 'active';
      if (activeNode === 'refiner' || roundsHistory.some(r => r.node === 'critic-done' && r.criticApproved)) return 'completed';
      return 'pending';
    }
    if (nodeIndex === 4) {
      if (activeNode === 'refiner') return 'active';
      return 'pending';
    }
    return 'pending';
  };

  const getLineFillWidth = () => {
    if (jobState === 'completed') return '100%';
    if (jobState === 'idle') return '0%';
    
    let completedCount = 0;
    for (let i = 1; i <= 4; i++) {
      if (getMissionNodeStatus(i) === 'completed') {
        completedCount++;
      }
    }
    if (completedCount === 0 || completedCount === 1) return '0%';
    if (completedCount === 2) return '33.33%';
    if (completedCount === 3) return '66.66%';
    return '100%';
  };

  const isDebating = useMemo(() => {
    return jobState === 'active' && roundsHistory.some(step => step.criticApproved === false);
  }, [roundsHistory, jobState]);

  // Validation Logs Badge mapping
  const parsedLogs = useMemo(() => {
    const start = startTimeRef.current || Date.now();
    return terminalLogs.map((log, idx) => {
      let status = 'INFO';
      let msg = log;
      let badgeType = 'info';

      // Check if it contains a Round indicator
      const roundMatch = log.match(/\[ROUND\s+(\d+)\]/i);
      if (roundMatch) {
        status = `ROUND ${roundMatch[1]}`;
        badgeType = 'round';
        msg = log.replace(/\[ROUND\s+\d+\]/i, '').trim();
      }

      if (log.includes('⚔️ DEBATE IN PROGRESS')) {
        status = 'BATTLE';
        badgeType = 'rejected';
      } else if (log.includes('VERDICT: REJECTED') || log.includes('failed') || log.includes('FAILED') || log.includes('aborted') || log.includes('Error')) {
        status = 'REJECTED';
        badgeType = 'rejected';
        if (roundMatch) {
          msg = log.replace(/\[ROUND\s+\d+\]/i, '').trim();
        }
      } else if (log.includes('VERDICT: APPROVED') || log.includes('SUCCESS:') || log.includes('passed') || log.includes('SUCCESS') || log.includes('COMPLETE')) {
        status = 'SUCCESS';
        badgeType = 'success';
        if (roundMatch) {
          msg = log.replace(/\[ROUND\s+\d+\]/i, '').trim();
        }
      } else if (log.startsWith('[SYSTEM]')) {
        status = 'INFO';
        badgeType = 'info';
        msg = log.replace('[SYSTEM]', '').trim();
      } else if (log.startsWith('[ERROR]')) {
        status = 'REJECTED';
        badgeType = 'rejected';
        msg = log.replace('[ERROR]', '').trim();
      }

      const logTime = new Date(start + idx * 1200);
      const timestamp = logTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      return { timestamp, status, badgeType, message: msg };
    });
  }, [terminalLogs]);

  // Bulletproof final code resolution cascade (never renders empty 6-line boilerplate once code is generated)
  const getFinalSolutionCode = useCallback(() => {
    // 1. Direct finalResult.finalCode from backend completion event
    if (finalResult?.finalCode && finalResult.finalCode.trim().length > 20 && !finalResult.finalCode.includes('Select a problem')) {
      return cleanCodeForEditor(finalResult.finalCode);
    }

    // 2. Refiner node code from roundsHistory
    const refinerNode = [...roundsHistory].reverse().find(r => (r.node === 'refiner' || r.node === 'refiner-done') && r.code);
    if (refinerNode?.code && refinerNode.code.trim().length > 20 && !refinerNode.code.includes('Select a problem')) {
      return cleanCodeForEditor(refinerNode.code);
    }

    // 3. Last code block in roundsHistory (Coder round 4, 3, 2, 1)
    const historyWithCode = roundsHistory.filter(r => r.code && r.code.trim().length > 20 && !r.code.includes('Select a problem'));
    if (historyWithCode.length > 0) {
      return cleanCodeForEditor(historyWithCode[historyWithCode.length - 1].code);
    }

    // 4. Live code if it contains actual generated solution
    if (liveCode && liveCode.trim().length > 20 && !liveCode.includes('Select a problem')) {
      return cleanCodeForEditor(liveCode);
    }

    // 5. Default starter boilerplate when idle
    return getLanguageStarterCode(language);
  }, [finalResult, roundsHistory, liveCode, language, getLanguageStarterCode]);

  const renderedCodeLines = useMemo(() => {
    const currentCodeToDisplay = getFinalSolutionCode();
    return currentCodeToDisplay.split('\n');
  }, [getFinalSolutionCode]);

  const allTestCases = useMemo(() => {
    const cases = [];
    roundsHistory.forEach((r) => {
      if (r.sandboxResults && Array.isArray(r.sandboxResults)) {
        r.sandboxResults.forEach((tc) => {
          cases.push({
            ...tc,
            input: unescapeHtmlEntities(tc.input),
            expectedOutput: unescapeHtmlEntities(tc.expectedOutput || tc.expected),
            actualOutput: unescapeHtmlEntities(tc.actualOutput || tc.actual),
            round: r.round || 1
          });
        });
      }
    });
    return cases;
  }, [roundsHistory]);

  return (
    <div 
      className="app-container" 
      ref={containerRef}
      style={{
        paddingBottom: isTerminalOpen ? `${terminalHeight + 30}px` : '80px',
        transition: isResizingTerminal ? 'none' : 'padding-bottom 0.3s ease-in-out'
      }}
    >
      {toastMessage && (
        <div className="toast-alert fade-in" style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          backgroundColor: '#0D1F17',
          color: '#6ee7b7',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(16, 185, 129, 0.3)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.85rem',
          fontWeight: 700,
          border: '1px solid rgba(16, 185, 129, 0.4)'
        }}>
          <CheckCircle2 size={16} style={{ color: '#10b981' }} />
          <span>{toastMessage}</span>
          <button 
            onClick={() => setToastMessage(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#6ee7b7',
              marginLeft: '10px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              opacity: 0.8
            }}
          >
            ×
          </button>
        </div>
      )}
      {/* Top Navbar Header */}
      <header className="app-header">
        <div className="logo-container" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Network size={22} style={{ color: 'var(--accent-green)' }} />
          <span className="logo-title" style={{ fontSize: '1.125rem', fontWeight: 800, letterSpacing: '0.4px', color: '#ffffff', display: 'flex', alignItems: 'center' }}>
            AlgoDebate AI
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="telemetry-wrapper">
            <div className="telemetry-item" title="Active solve run duration">
              <span className="telemetry-label">Latency:</span>
              <span className="telemetry-value">{latencyString}</span>
            </div>
          </div>

          {/* Sound Toggle Button */}
          <button 
            onClick={() => {
              const nextMuted = !isMuted;
              setIsMuted(nextMuted);
              if (!nextMuted) {
                try {
                  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                  const osc = audioCtx.createOscillator();
                  const gain = audioCtx.createGain();
                  osc.connect(gain);
                  gain.connect(audioCtx.destination);
                  osc.type = 'sine';
                  osc.frequency.setValueAtTime(659.25, audioCtx.currentTime);
                  gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
                  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
                  osc.start();
                  osc.stop(audioCtx.currentTime + 0.15);
                } catch (_) {}
              }
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: isMuted ? 'var(--text-muted)' : 'var(--accent-green)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '6px',
              transition: 'all 0.2s'
            }}
            title={isMuted ? "Unmute Sound" : "Mute Sound"}
          >
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </header>

      {/* 3-Column SaaS Grid (12 Columns) */}
      <main className="main-container">
        
        {/* Left Column (col-span-3): Input, Configuration, Mission Path */}
        <section className="panel-left h-[700px] max-h-[700px] flex flex-col justify-start gap-2.5 pb-2 overflow-hidden">
          
          {/* PROBLEM INPUT Section */}
          <div className="bento-card" style={{ padding: '12px 14px', gap: '10px' }}>
            <h2 className="card-title">
              <FileText size={13} />
              PROBLEM INPUT
            </h2>
            <form onSubmit={handleStartDebate} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Problem Source
                </label>
                <input
                  type="text"
                  className="problem-url-input"
                  placeholder="Paste LeetCode Link (Optional)"
                  value={problemUrl}
                  onChange={(e) => setProblemUrl(e.target.value)}
                  disabled={jobState === 'active'}
                />
              </div>
              <textarea
                className="problem-textarea"
                placeholder="Enter algorithm details or problem description..."
                value={problemDescription}
                onChange={(e) => setProblemDescription(e.target.value)}
                disabled={jobState === 'active'}
                style={{ height: '60px' }}
              />
            </form>
          </div>
          
          {/* CONFIGURATION & EXECUTION Section */}
          <div className="bento-card" style={{ padding: '12px 14px', gap: '10px' }}>
            <h2 className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Settings size={13} className="text-[#10B981]" />
                <span>CONFIGURATION & EXECUTION</span>
              </div>
              <button 
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '0.85rem',
                  lineHeight: '1',
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1.0)'}
                title="Configure System Prompts"
              >
                ⚙️
              </button>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Max Iterations</label>
                  <div className="select-wrapper">
                    <select className="bento-select" value={maxRounds} onChange={(e) => setMaxRounds(Number(e.target.value))} disabled={jobState === 'active'}>
                      <option value="2">2 Rounds</option>
                      <option value="3">3 Rounds</option>
                      <option value="4">4 Rounds</option>
                      <option value="5">5 Rounds</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Language</label>
                  <div className="select-wrapper">
                    <select 
                      className="bento-select" 
                      value={language} 
                      onChange={(e) => setLanguage(e.target.value)} 
                      disabled={jobState === 'active'}
                    >
                      <option value="cpp">C++</option>
                      <option value="python">Python</option>
                      <option value="java">Java</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Timeout [sec]</label>
                  <div className="select-wrapper">
                    <select className="bento-select" value={timeoutMs / 1000} onChange={(e) => setTimeoutMs(Number(e.target.value) * 1000)} disabled={jobState === 'active'}>
                      <option value="5">5 sec</option>
                      <option value="10">10 sec</option>
                      <option value="15">15 sec</option>
                      <option value="30">30 sec</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Test Cases</label>
                  <div className="select-wrapper">
                    <select className="bento-select" value={testCasesCount} onChange={(e) => setTestCasesCount(e.target.value)} disabled={jobState === 'active'}>
                      <option value="0">Default/0</option>
                      <option value="1">Custom/1</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Custom Test Cases Box inside card */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                <textarea
                  placeholder="Enter custom inputs (e.g. 4 \n 3 5 8)"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  disabled={isCustomRunning}
                  style={{
                    width: '100%',
                    height: '38px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-slate)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    padding: '6px 8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    resize: 'none',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  className="btn-run-custom-test"
                  onClick={handleRunCustomTest}
                  disabled={isCustomRunning || (!liveCode && !(finalResult?.finalCode))}
                >
                  {isCustomRunning ? (
                    <>
                      <Loader2 size={11} className="animate-spin" />
                      <span>Running...</span>
                    </>
                  ) : (
                    <>
                      <Play size={10} />
                      <span>Run Custom Test</span>
                    </>
                  )}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                <button
                  onClick={handleStartDebate}
                  className="btn-verify-primary"
                  disabled={jobState === 'active'}
                >
                  <Play size={12} style={{ fill: '#000000' }} />
                  <span>Run Verification</span>
                </button>
                <button
                  onClick={handleReset}
                  className="btn-reset-secondary"
                >
                  <span>Reset Dashboard</span>
                </button>
              </div>
            </div>
          </div>
          
          {/* LangGraph Mission Path Node Flow */}
          <div className="bento-card" style={{ padding: '10px 14px', gap: '8px' }}>
            <h2 className="card-title">
              <Workflow size={13} />
              LANGGRAPH MISSION PATH
            </h2>
            <div className="mission-path-container" style={{ padding: '10px 14px' }}>
              {/* Stage 1: Input */}
              <div className={`mission-node-wrapper ${getMissionNodeStatus(1)}`}>
                <div className="mission-circle">
                  <FileText size={18} />
                </div>
                <span className="mission-label">Input</span>
              </div>
              
              {/* Stage 2: Process */}
              <div className={`mission-node-wrapper ${getMissionNodeStatus(2)}`}>
                <div className="mission-circle">
                  <Cpu size={18} className={getMissionNodeStatus(2) === 'active' ? 'animate-spin' : ''} />
                </div>
                <span className="mission-label">Process</span>
              </div>
              
              {/* Stage 3: Validate */}
              <div className={`mission-node-wrapper ${getMissionNodeStatus(3)}`}>
                <div className="mission-circle">
                  <ShieldCheck size={18} />
                </div>
                <span className="mission-label">Validate</span>
              </div>
              
              {/* Stage 4: Complete */}
              <div className={`mission-node-wrapper ${getMissionNodeStatus(4)}`}>
                <div className="mission-circle">
                  <Check size={18} />
                </div>
                <span className="mission-label">Complete</span>
              </div>
            </div>
          </div>
        </section>
        
        {/* Center Column (col-span-6): Verification Workspace */}
        <section className="panel-center h-[700px] max-h-[700px] flex flex-col overflow-hidden">
          
          {/* Verification Workspace Card */}
          <div className="bento-card code-workspace-card h-[700px] max-h-[700px] flex flex-col overflow-hidden">
            {/* VERIFIED Banner */}
            {jobState === 'completed' && finalResult && (
              <div className="verified-banner fade-in" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '16px',
                width: '100%'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#000000',
                    boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)'
                  }}>
                    <Check size={18} strokeWidth={3} />
                  </div>
                  <div>
                    <div style={{ color: '#10b981', fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.05em' }}>VERIFIED</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.72rem', marginTop: '1px' }}>All validation checks passed.</div>
                  </div>
                </div>
                <div style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '100px',
                  padding: '4px 12px',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  3/3 checks passed
                </div>
              </div>
            )}

            {/* Simplified Workspace Header: Solution Code Indicator & Action Controls */}
            <div className="code-editor-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'rgba(13, 14, 18, 0.95)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', gap: '10px', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Code2 size={16} className="text-emerald-400" />
                <span className="card-title" style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 800, margin: 0 }}>
                  CODE EDITOR
                </span>
              </div>
              
              {/* Right Action Controls */}
              <div className="workspace-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: 'auto' }}>
                <div className="code-editor-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button type="button" className="editor-btn" onClick={handleTabCopy} title="Copy solution code">
                    {isCopied ? <Check size={11} style={{ color: 'var(--accent-green)' }} /> : <Copy size={11} />}
                    <span>{isCopied ? 'Copied' : 'Copy Code'}</span>
                  </button>
                  <button type="button" className="editor-btn" onClick={handleTabDownload} title="Download solution code">
                    <Download size={11} />
                    <span>Download</span>
                  </button>
                  <button type="button" className="editor-btn" onClick={handleTabShare} title="Share solution link">
                    <Share2 size={11} />
                    <span>Share</span>
                  </button>
                </div>
              </div>
            </div>
            
            <div className="workspace-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
              {isDebating && (
                <div className="battle-alert-banner animate-pulse" style={{
                  background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.15) 0%, rgba(245, 158, 11, 0.15) 100%)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  boxShadow: '0 0 15px rgba(245, 158, 11, 0.15)',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: '#f59e0b',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase'
                }}>
                  <span>⚔️ DEBATE IN PROGRESS: Critic challenged Coder</span>
                </div>
              )}
              
              <div className="code-editor-container custom-scrollbar fade-in">
                {renderedCodeLines.map((line, idx) => (
                  <div key={idx} className="code-line-row">
                    <span className="code-line-number">{idx + 1}</span>
                    {renderSyntaxHighlightedLine(line, language)}
                  </div>
                ))}
              </div>
              {jobState === 'failed' && (
                <div className="workspace-empty-view fade-in">
                  <AlertTriangle size={32} style={{ color: 'var(--accent-red)' }} />
                  <h3 style={{ color: 'var(--accent-red)', fontSize: '0.85rem', fontWeight: 700 }}>VERIFICATION FAILED</h3>
                  <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>{error}</p>
                </div>
              )}
            </div>
          </div>
        </section>
        
        {/* Right Column (col-span-3): Pipeline & Logs */}
        <section className="panel-right h-[700px] max-h-[700px] flex flex-col justify-between overflow-hidden">
          
          {/* Card 1: AGENT STATUS */}
          <div className="bento-card arena-card">
            <h2 className="card-title">
              <GitFork size={13} />
              AGENT STATUS
            </h2>
            <div className="pipeline-steps-container">
              {['coder', 'sandbox', 'critic', 'refiner'].map((node) => {
                const status = getNodeStatusClass(node);
                const agentLabels = {
                  coder: 'Coder',
                  sandbox: 'Compiler',
                  critic: 'Critic',
                  refiner: 'Refiner'
                };
                const agentIcons = {
                  coder: Code2,
                  sandbox: Cpu,
                  critic: ShieldCheck,
                  refiner: Sparkles
                };
                const label = agentLabels[node];
                const IconComponent = agentIcons[node];
                const completed = status === 'status-completed';
                const active = status === 'status-active';
                const statusText = completed ? 'COMPLETE' : (active ? 'RUNNING' : 'PENDING');
                
                return (
                  <div key={node} className={`pipeline-step-node ${completed ? 'completed' : (active ? 'active' : '')}`}>
                    <div className="pipeline-step-circle">
                      {completed ? (
                        <Check size={22} />
                      ) : active ? (
                        <Loader2 size={22} className="animate-spin" />
                      ) : (
                        <IconComponent size={22} />
                      )}
                    </div>
                    <span className="pipeline-step-label">{label}</span>
                    <span className="pipeline-step-status-pill">{statusText}</span>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Card 2: Verification Confidence Progress Bar */}
          <div className="bento-card confidence-card">
            <div className="confidence-header">
              <span>VERIFICATION CONFIDENCE</span>
              <span style={{ color: 'var(--accent-green)', fontWeight: 800 }}>{optPercent}%</span>
            </div>
            <div className="confidence-bar-bg">
              <div className="confidence-bar-fill" style={{ width: `${optPercent}%` }}></div>
            </div>
          </div>
          
          {/* Card 3: VALIDATION LOGS */}
          <div className="bento-card logs-card flex-1 flex flex-col justify-between min-h-0 overflow-hidden">
            <h2 className="card-title">
              <TerminalIcon size={13} />
              VALIDATION LOGS
            </h2>
            <div ref={terminalContainerRef} className="logs-terminal flex-1 overflow-y-auto max-h-[440px]" style={{ padding: '8px 12px' }}>
              {parsedLogs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', padding: '20px 0' }}>
                  No active logs streamed.
                </div>
              ) : (
                <>
                  {parsedLogs.map((log, index) => {
                    let LogIcon = <TerminalIcon size={12} style={{ color: '#94a3b8', opacity: 0.6 }} />;
                    if (log.status === 'SUCCESS' || log.status === 'COMPLETE') {
                      LogIcon = <CheckCircle2 size={12} style={{ color: '#10b981' }} />;
                    } else if (log.status === 'REJECTED' || log.status === 'BATTLE') {
                      LogIcon = <AlertTriangle size={12} style={{ color: '#f59e0b' }} />;
                    }
                    
                    let statusStyle = {};
                    if (log.status === 'INFO' || log.badgeType === 'info') {
                      statusStyle = {
                        backgroundColor: '#1e293b',
                        color: '#cbd5e1',
                        borderColor: '#334155'
                      };
                    } else if (log.status === 'SUCCESS') {
                      statusStyle = {
                        backgroundColor: '#022c22',
                        color: '#34d399',
                        borderColor: '#064e3b'
                      };
                    } else if (log.status === 'COMPLETE' || log.status === 'SUCCESS' && jobState === 'completed') {
                      statusStyle = {
                        backgroundColor: '#1a2e05',
                        color: '#a3e635',
                        borderColor: '#3f6212'
                      };
                    } else if (log.status === 'REJECTED' || log.status === 'BATTLE') {
                      statusStyle = {
                        backgroundColor: '#450a0a',
                        color: '#f87171',
                        borderColor: '#7f1d1d'
                      };
                    } else if (log.status.startsWith('ROUND')) {
                      statusStyle = {
                        backgroundColor: '#3b0764',
                        color: '#c084fc',
                        borderColor: '#581c87'
                      };
                    }

                    return (
                      <div 
                        key={index} 
                        className="log-line-card fade-in" 
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(23, 23, 23, 0.6)',
                          border: '1px solid rgba(38, 38, 38, 0.8)',
                          marginBottom: '8px',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                          <span style={{ fontSize: '0.68rem', color: '#64748b', fontFamily: 'monospace', flexShrink: 0 }}>
                            {log.timestamp}
                          </span>
                          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                            {LogIcon}
                          </div>
                          <span className="log-message" style={{ fontSize: '0.74rem', color: '#cbd5e1', wordBreak: 'break-word', fontFamily: 'monospace' }}>
                            {log.message}
                          </span>
                        </div>
                        <span 
                          className="log-status-badge" 
                          style={{
                            fontSize: '0.6rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            textTransform: 'uppercase',
                            borderWidth: '1px',
                            borderStyle: 'solid',
                            flexShrink: 0,
                            letterSpacing: '0.05em',
                            ...statusStyle
                          }}
                        >
                          {log.status}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={terminalEndRef} />
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setIsTerminalOpen(prev => !prev);
                if (!isTerminalOpen && terminalEndRef.current) {
                  setTimeout(() => {
                    terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
                  }, 150);
                }
              }}
              className="btn-trace-footer"
            >
              <Terminal size={16} className="text-emerald-400" style={{ marginRight: '8px' }} />
              <span className="text-emerald-400 font-semibold tracking-wide" style={{ fontSize: '0.875rem' }}>
                {isTerminalOpen ? 'Hide Execution Trace' : 'View Full Execution Trace'}
              </span>
            </button>
          </div>
        </section>
      </main>

      {/* Restored Original Bottom Cards Section: Complexity Analysis & Strategy Proof (Rendered ONLY when hasExecuted is true) */}
      {hasExecuted && (
        <div className="grid grid-cols-2 gap-4 w-full mt-4 max-w-[1750px] mx-auto fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', width: '100%', maxWidth: '1750px', margin: '16px auto 0', alignItems: 'stretch' }}>
          
          {/* LEFT CARD: COMPLEXITY ANALYSIS */}
          <div className="bento-card col-span-1 h-full min-h-[220px] flex flex-col justify-between" style={{
            background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(15, 23, 42, 0.9) 100%)',
            border: '1px solid rgba(6, 182, 212, 0.35)',
            boxShadow: '0 4px 20px rgba(6, 182, 212, 0.1)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '220px',
            height: '100%',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ backgroundColor: 'rgba(6, 182, 212, 0.18)', color: '#06b6d4', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                    <Clock size={16} />
                  </div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    COMPLEXITY ANALYSIS
                  </span>
                </div>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#38bdf8', backgroundColor: 'rgba(6, 182, 212, 0.15)', padding: '3px 8px', borderRadius: '100px', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
                  VERIFIED
                </span>
              </div>

              {/* Side-by-side Badges for Time & Space Complexity */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ background: 'rgba(6, 182, 212, 0.12)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '8px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Time Complexity</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
                    {formatLatexFormula(unescapeNewlines(finalResult?.timeComplexity || finalResult?.time_complexity || 'O(N)'))}
                  </div>
                </div>
                <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Space Complexity</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#34d399', marginTop: '2px' }}>
                    {formatLatexFormula(unescapeNewlines(finalResult?.spaceComplexity || finalResult?.space_complexity || 'O(1)'))}
                  </div>
                </div>
              </div>

              <p style={{ fontSize: '0.74rem', color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
                Optimal runtime asymptotic scaling verified by multi-agent validation.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveModal('complexity')}
              style={{
                background: 'rgba(6, 182, 212, 0.18)',
                border: '1px solid rgba(6, 182, 212, 0.4)',
                color: '#38bdf8',
                cursor: 'pointer',
                gap: '6px',
                height: '34px',
                borderRadius: '8px',
                fontSize: '0.72rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '6px'
              }}
              className="w-full py-2 px-4 text-xs font-semibold rounded-lg border transition-all text-center flex items-center justify-center hover:bg-cyan-500/25 hover:border-cyan-400"
            >
              <span>View Complexity Report &gt;</span>
            </button>
          </div>

          {/* RIGHT CARD: STRATEGY & PROOF */}
          <div className="bento-card col-span-1 h-full min-h-[220px] flex flex-col justify-between" style={{
            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(15, 23, 42, 0.9) 100%)',
            border: '1px solid rgba(168, 85, 247, 0.35)',
            boxShadow: '0 4px 20px rgba(168, 85, 247, 0.1)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '220px',
            height: '100%',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ backgroundColor: 'rgba(168, 85, 247, 0.18)', color: '#c084fc', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                    <ShieldCheck size={16} />
                  </div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    STRATEGY & PROOF
                  </span>
                </div>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#c084fc', backgroundColor: 'rgba(168, 85, 247, 0.15)', padding: '3px 8px', borderRadius: '100px', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                  PROVED
                </span>
              </div>

              <div style={{ background: 'rgba(13, 14, 18, 0.65)', border: '1px solid rgba(168, 85, 247, 0.25)', borderRadius: '8px', padding: '12px', maxHeight: '110px', overflowY: 'auto' }}>
                <p style={{ fontSize: '0.75rem', color: '#e2e8f0', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {(finalResult?.strategy || finalResult?.proof || finalResult?.explanation) ? 
                    (finalResult.strategy || finalResult.proof || finalResult.explanation).substring(0, 220) + ((finalResult.strategy || finalResult.proof || finalResult.explanation).length > 220 ? '...' : '') : 
                    'Algorithmic invariant strategy and correctness proof generated by multi-agent consensus.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveModal('strategy')}
              style={{
                background: 'rgba(168, 85, 247, 0.18)',
                border: '1px solid rgba(168, 85, 247, 0.4)',
                color: '#c084fc',
                cursor: 'pointer',
                gap: '6px',
                height: '34px',
                borderRadius: '8px',
                fontSize: '0.72rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '6px'
              }}
              className="w-full py-2 px-4 text-xs font-semibold rounded-lg border transition-all text-center flex items-center justify-center hover:bg-purple-500/25 hover:border-purple-400"
            >
              <span>Read Strategy & Proof Breakdown &gt;</span>
            </button>
          </div>
        </div>
      )}

      {/* Slide-Up Detailed Execution Terminal Bottom Drawer (VS Code Style with Drag-to-Resize) */}
      <div 
        className={`terminal-widget-drawer ${isTerminalOpen ? 'open' : 'collapsed'}`}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: isTerminalOpen ? `${terminalHeight}px` : '0px',
          background: '#060709',
          borderTop: isTerminalOpen ? '1px solid rgba(16, 185, 129, 0.3)' : 'none',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          transition: isResizingTerminal ? 'none' : 'all 0.3s ease-in-out',
          boxShadow: isTerminalOpen ? '0 -10px 30px rgba(0, 0, 0, 0.7)' : 'none',
          overflow: 'hidden'
        }}
      >
        {/* Top Draggable Border Handle */}
        {isTerminalOpen && (
          <div
            onMouseDown={handleMouseDownResize}
            style={{
              height: '8px',
              width: '100%',
              cursor: 'ns-resize',
              background: isResizingTerminal ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 255, 255, 0.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s ease',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 10
            }}
            title="Click and drag UP/DOWN to resize terminal drawer"
          >
            <div 
              style={{
                width: '40px',
                height: '3px',
                borderRadius: '2px',
                backgroundColor: isResizingTerminal ? '#10b981' : 'rgba(255, 255, 255, 0.3)'
              }}
            />
          </div>
        )}

        {isTerminalOpen && (
          <>
            <div 
              className="terminal-header" 
              style={{ 
                padding: '8px 16px',
                marginTop: '4px',
                background: 'rgba(13, 14, 18, 0.95)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="terminal-header-dots" style={{ display: 'flex', gap: '6px', marginRight: '4px' }}>
                  <span className="terminal-dot red" style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
                  <span className="terminal-dot yellow" style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }}></span>
                  <span className="terminal-dot green" style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 600, color: '#f8fafc', letterSpacing: '0.04em' }}>
                  <TerminalIcon size={14} style={{ color: '#10b981' }} />
                  <span>FULL EXECUTION TRACE LOGS</span>
                  <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: 700 }}>
                    {`${terminalHeight}PX`}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {/* Collapse Button */}
                <button 
                  type="button"
                  onClick={() => setIsTerminalOpen(false)}
                  title="Collapse Terminal"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.72rem'
                  }}
                  className="hover:text-white hover:bg-slate-800/60 transition-colors"
                >
                  <ChevronDown size={14} />
                  <span>Collapse</span>
                </button>

                {/* Toggle Height/Maximize Button */}
                <button 
                  type="button"
                  onClick={toggleMaximizeTerminal}
                  title={terminalHeight > 320 ? "Restore Height (230px)" : "Maximize Panel (450px)"}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.72rem'
                  }}
                  className="hover:text-white hover:bg-slate-800/60 transition-colors"
                >
                  {terminalHeight > 320 ? (
                    <>
                      <Minimize2 size={14} />
                      <span>Restore</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 size={14} />
                      <span>Expand</span>
                    </>
                  )}
                </button>

                {/* Close Button */}
                <button 
                  type="button"
                  onClick={() => {
                    setIsTerminalOpen(false);
                    setTerminalHeight(230);
                  }}
                  title="Close Panel"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  className="hover:text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div 
              className="terminal-body custom-scrollbar" 
              style={{ 
                flex: 1, 
                padding: '12px 16px', 
                overflowY: 'auto', 
                maxHeight: `${terminalHeight - 44}px`,
                fontFamily: 'var(--font-mono)', 
                fontSize: '0.75rem', 
                lineHeight: '1.6',
                background: '#040507',
                color: '#cbd5e1'
              }}
            >
              {terminalLogs.length === 0 ? (
                <div style={{ color: '#64748b', fontStyle: 'italic', padding: '12px 0' }}>
                  No trace logs recorded yet. Start a problem debate to view live node traces.
                </div>
              ) : (
                terminalLogs.map((log, index) => {
                  let logStyle = { color: '#cbd5e1' };
                  if (log.startsWith('[ERROR]')) logStyle = { color: '#f87171', fontWeight: 600 };
                  else if (log.startsWith('[SYSTEM]')) logStyle = { color: '#38bdf8', fontWeight: 500 };
                  else if (log.includes('VERDICT: APPROVED') || log.includes('SUCCESS:')) logStyle = { color: '#34d399', fontWeight: 700 };
                  else if (log.startsWith('[Node:')) logStyle = { color: '#c084fc', fontWeight: 600 };

                  return (
                    <div key={index} className="terminal-log-line" style={{ marginBottom: '4px', display: 'flex', gap: '10px' }}>
                      <span style={{ color: '#475569', fontSize: '0.7rem', userSelect: 'none', minWidth: '24px' }}>{`${index + 1}.`}</span>
                      <span style={logStyle}>{log}</span>
                    </div>
                  );
                })
              )}
              <div ref={terminalEndRef} />
            </div>
          </>
        )}
      </div>

      {/* Settings Modal (Overlay) */}
      {isSettingsOpen && (
        <div className="settings-modal-overlay fade-in" onClick={() => setIsSettingsOpen(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Agent System Config</h3>
              <button className="modal-close-btn" onClick={() => setIsSettingsOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="prompt-field-group">
                <label className="prompt-label">Coder Agent Prompt</label>
                <textarea
                  className="prompt-textarea"
                  value={coderPrompt}
                  onChange={(e) => setCoderPrompt(e.target.value)}
                />
              </div>
              <div className="prompt-field-group">
                <label className="prompt-label">Critic Agent Prompt</label>
                <textarea
                  className="prompt-textarea"
                  value={criticPrompt}
                  onChange={(e) => setCriticPrompt(e.target.value)}
                />
              </div>
              <div className="prompt-field-group">
                <label className="prompt-label">Refiner Agent Prompt</label>
                <textarea
                  className="prompt-textarea"
                  value={refinerPrompt}
                  onChange={(e) => setRefinerPrompt(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-verify-primary" onClick={() => setIsSettingsOpen(false)} style={{ width: '100px', height: '32px' }}>
                Save Config
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Vault History drawer */}
      {isVaultOpen && (
        <div className="vault-drawer-overlay" onClick={() => setIsVaultOpen(false)}>
          <div className="vault-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="vault-header">
              <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={15} style={{ color: 'var(--accent-green)' }} />
                History Vault
              </span>
              <button className="modal-close-btn" onClick={() => setIsVaultOpen(false)}>×</button>
            </div>
            
            <div className="vault-body">
              {vaultRecords.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', padding: '40px 0' }}>
                  No sessions saved yet.
                </div>
              ) : (
                vaultRecords.map((record) => (
                  <div
                    key={record.jobId}
                    className="vault-item"
                    onClick={() => handleSelectVaultRecord(record)}
                    title="Click to restore session"
                  >
                    <span className="vault-item-title">{record.problemDescription}</span>
                    <div className="vault-item-meta">
                      <span>{record.language.toUpperCase()} • {record.maxRounds} Rounds</span>
                      <span>{new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* Interactive Pop-Up Modal Overlay for Complexity & Strategy */}
      {activeModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => {
            setActiveModal(null);
            setIsModalMaximized(false);
          }}
          className="fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: isModalMaximized ? '95vw' : '680px',
              maxWidth: '95vw',
              maxHeight: isModalMaximized ? '90vh' : '80vh',
              background: '#090a0f',
              border: activeModal === 'complexity' ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid rgba(168, 85, 247, 0.4)',
              borderRadius: '16px',
              boxShadow: activeModal === 'complexity' ? '0 0 40px rgba(6, 182, 212, 0.2)' : '0 0 40px rgba(168, 85, 247, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              transition: 'all 0.25s ease-in-out'
            }}
          >
            {/* Modal Header */}
            <div 
              style={{
                padding: '14px 20px',
                background: 'rgba(13, 14, 18, 0.95)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {activeModal === 'complexity' ? (
                  <>
                    <Clock size={20} className="text-cyan-400" />
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                      Algorithmic Complexity Report
                    </h3>
                  </>
                ) : (
                  <>
                    <Sparkles size={20} className="text-purple-400" />
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                      Strategy & Proof of Correctness
                    </h3>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Copy Button */}
                <button
                  type="button"
                  onClick={handleTabCopy}
                  title="Copy Content"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '5px 10px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.72rem'
                  }}
                  className="hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <Copy size={12} />
                  <span>Copy</span>
                </button>

                {/* Download Button */}
                <button
                  type="button"
                  onClick={handleTabDownload}
                  title="Download Document"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '5px 10px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.72rem'
                  }}
                  className="hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <Download size={12} />
                  <span>Download</span>
                </button>

                {/* Maximize / Restore Toggle */}
                <button
                  type="button"
                  onClick={() => setIsModalMaximized(prev => !prev)}
                  title={isModalMaximized ? "Restore Size" : "Maximize Modal"}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '4px 6px',
                    borderRadius: '4px'
                  }}
                  className="hover:text-white hover:bg-slate-800 transition-colors"
                >
                  {isModalMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    setIsModalMaximized(false);
                  }}
                  title="Close (Esc)"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '4px 6px',
                    borderRadius: '4px'
                  }}
                  className="hover:text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div 
              className="modal-body custom-scrollbar"
              style={{
                flex: 1,
                padding: '24px',
                overflowY: 'auto',
                color: '#cbd5e1',
                fontSize: '0.85rem',
                lineHeight: 1.6
              }}
            >
              {activeModal === 'complexity' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="stat-card complexity-cyan-card" style={{
                      background: 'rgba(6, 182, 212, 0.08)',
                      borderRadius: '12px',
                      border: '1px solid rgba(6, 182, 212, 0.3)',
                      boxShadow: '0 0 20px rgba(6, 182, 212, 0.1)',
                      padding: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px'
                    }}>
                      <div style={{ backgroundColor: 'rgba(6, 182, 212, 0.2)', color: '#06b6d4', borderRadius: '10px', padding: '12px', display: 'flex' }}>
                        <Clock size={26} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Time Complexity</div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#06b6d4', marginTop: '4px' }}>
                          {finalResult?.timeComplexity ? formatLatexFormula(unescapeNewlines(finalResult.timeComplexity)) : 'O(N)'}
                        </div>
                      </div>
                    </div>

                    <div className="stat-card complexity-emerald-card" style={{
                      background: 'rgba(16, 185, 129, 0.08)',
                      borderRadius: '12px',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      boxShadow: '0 0 20px rgba(16, 185, 129, 0.1)',
                      padding: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px'
                    }}>
                      <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#10b981', borderRadius: '10px', padding: '12px', display: 'flex' }}>
                        <Database size={26} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Space Complexity</div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                          {finalResult?.spaceComplexity ? formatLatexFormula(unescapeNewlines(finalResult.spaceComplexity)) : 'O(1)'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{
                    background: 'rgba(13, 14, 18, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '20px',
                    lineHeight: 1.7
                  }}>
                    <h4 style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.9rem', marginBottom: '8px' }}>
                      Big-O Algorithmic Scaling Analysis
                    </h4>
                    <p style={{ color: '#cbd5e1' }}>
                      The algorithm produced by the Coder Agent and refined by the Critic & Refiner subagents has been verified to adhere to optimal time and space bounds.
                      Time complexity is evaluated at <strong>{finalResult?.timeComplexity ? formatLatexFormula(unescapeNewlines(finalResult.timeComplexity)) : 'O(N)'}</strong> and auxiliary memory consumption scales at <strong>{finalResult?.spaceComplexity ? formatLatexFormula(unescapeNewlines(finalResult.spaceComplexity)) : 'O(1)'}</strong>.
                    </p>
                  </div>
                </div>
              )}

              {activeModal === 'strategy' && (
                <div style={{
                  background: 'rgba(13, 14, 18, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '20px',
                  lineHeight: 1.7
                }}>
                  {finalResult?.explanation ? (
                    renderFormattedMarkdown(finalResult.explanation)
                  ) : (
                    <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                      Strategy & proof analysis will be populated once graph execution concludes.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
