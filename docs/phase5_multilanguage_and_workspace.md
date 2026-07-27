# Interview Prep Guide: Phase 5 (Multi-Language Sandbox & Advanced Workspace)

This guide is designed to help you prepare for system design and advanced software engineering interviews, focusing specifically on building multi-language compilation/runtime sandboxes, advanced interactive developer workspace features (Diff views and Session hydration), and universal autonomous agent loop upgrades.

---

## 1. Core Concepts Explained Simply

### Concept A: Multi-Language Sandbox Routing
A sandbox runner must dynamically execute different programming paradigms safely. In our application, we handle compilation-based languages and interpreted languages:
1. **C++ (Ahead-of-Time Compiled):** We write code to `solution_[id].cpp`, compile it to an executable using `g++ -O3`, and execute the compiled binary as a child process.
2. **Python (Interpreted):** Python does not have a separate compile step. We write code directly to `solution_[id].py` and run it via the `python3` (or `python`) interpreter child process.
3. **Java (Class-Based Compiled):** Java has strict filename-to-class mapping rules.
   * **The Challenge:** Java requires the file name to match the `public class` name (e.g. `Main.java` or `Solution.java`). 
   * **Our Solution:** We run a regex matching group to detect the class name from the code, create an isolated directory `java_[id]/` (to prevent class file contamination), write `{ClassName}.java`, compile using `javac`, and run using the JVM interpreter `java -cp java_[id] {ClassName}`.

---

### Concept B: Code Evolution Split-Screen Diff View
When showing code modifications made by a Refiner agent, a standard single-pane text comparison is hard to scan. A side-by-side split screen view requires matching line alignments:
* **The Heuristic:** Our `computeLineDiff` function uses a linear lookahead matching algorithm.
* **How it works:** It processes lines from both files concurrently using index pointers `oldIdx` and `newIdx`. If lines mismatch, it searches ahead up to 20 lines:
  1. If the current `newLine` is found further down in `oldLines`, it indicates lines were **deleted** from the original code. We align by pushing blank lines into the right panel.
  2. If the current `oldLine` is found further down in `newLines`, it indicates lines were **added** to the new code. We align by pushing blank lines into the left panel.
  3. If no match is found within the lookahead window, it treats the mismatch as a direct replacement/addition/deletion.
* **Why this is critical:** It ensures unchanged lines align horizontally on both left and right panes, creating a clean premium diff view.

---

### Concept C: Local Session History Vault
Single Page Applications (SPAs) lose their state on page refreshes.
* **Session vault:** When a solver execution completes, the app automatically serializes the entire state tree: problem description, custom system prompts, rounds history, code evolution drafts, and execution times, saving it under a unique timestamp in `localStorage`.
* **Hydration:** To restore a session, the app pulls the payload from `localStorage`, resets all current execution variables, and populates the React state variables simultaneously. This updates the bento grid dashboard elements, timeline pills, and code panels instantly.

---

### Concept D: Dynamic Edge-Case Sandbox Synthesis
Relying on hardcoded or human-written test cases is unscalable. In the execution preparation phase:
* **Adversarial Synthesis:** The orchestrator utilizes a dedicated prompt block that parses the problem description, extracts mathematical boundaries/constraints, and synthesizes a matrix of exactly 5 diverse adversarial test cases.
* **Coverage Scope:** The cases are generated to hit standard edge profiles:
  1. **Maximum limits** (upper bounds of input sizes/values).
  2. **Negative/Empty/Zero states** (empty lists, negative values, N=0/N=1 limits).
  3. **Uniform elements** (all inputs are identical, like an array of uniform elements).
  4. **Average standard cases**.
  5. **Logical overflow boundaries** (inputs triggering arithmetic overflows, prime cases, etc.).
* **Wired Execution:** Generated test cases are passed into the sandbox compiled executions, forcing the solution to prove its correctness against a high-coverage suite from the start.

---

### Concept E: Universal Algorithmic Critic Framework
Instead of parsing basic keyword matches to critique code, the Critic agent employs a mathematical evaluation template:
* **Internal Classification:** The Critic reads the problem criteria and classifies the algorithmic family (e.g. Dynamic Programming, Graph Theory, Greedy, Segment Trees, Bit Manipulation).
* **Complexity Benchmarking:** It establishes the standard optimal time/space complexity bounds for that class of problems (e.g. $O(N)$ for prefix sums or $O(V+E)$ for graph BFS).
* **Strict Evaluation:** It parses the solution's actual structure, cross-verifies its complexity bounds, and rejects the code if it fails to hit standard category benchmarks.

---

### Concept F: Generic Error Rectification Loop
Debugging code requires piping sandbox stderr streams straight back to the next prompt iterations.
* **Fault Logging:** If any test case fails inside the sandbox with compilation flags, timeout exceptions (TLE), or runtime exceptions (RTE/segfaults), the orchestrator intercepts the raw execution results and appends standard error output logs (`stderr`) directly into the `criticismHistory` object.
* **Correction-Aware Polishing**: The subsequent Coder prompt and the final Refiner agent ingest the historical stderr streams, ensuring that the refined code draft fixes compilation syntax faults and memory leaks before finalizing the solution.

---

### Concept G: Extending Sandbox Kernels (Adding New Languages)
To add a new language kernel (e.g., Go or Rust) in the future, follow this sequence:
1. **Frontend Update:** Add the target language identifier option to the dropdown selector in `frontend/src/App.jsx`.
2. **Sandbox Router Extension:** Modify the `executeCpp` function in `backend/src/executor/cppExecutor.js`:
   * Define file extensions (e.g., `.go`, `.rs`).
   * Specify compile instructions (e.g., `go build` or `rustc`).
   * Route process executions with correct spawned arguments.
3. **Agent Schema Configuration:** Extend the schema descriptions inside `coderAgent.js` and `refinerAgent.js` to dynamically inject the syntax rules of the new language into the Gemini structured JSON schemas.

---

## 2. Top Interview Questions & Answers

### Q1: How does your Java sandbox execution prevent class name conflicts and namespace pollution?
* **Answer:** Since Java compiled `.class` files are placed on disk, compiling multiple Java solutions with default class names (like `Main` or `Solution`) in the same directory leads to class overwriting and race conditions. We resolve this by:
  1. Parsing the class name dynamically from the source code via regex.
  2. Creating a unique isolated directory for every execution run (e.g., `temp/java_[id]`).
  3. Writing and compiling the file inside that folder.
  4. Spawning the JVM with classpath arguments specifying the subfolder (`java -cp temp/java_[id] ClassName`).
  5. Deleting the entire directory recursively inside the `finally` block to prevent disk-space leaks.

---

### Q2: What is the complexity of your custom split-screen diff algorithm, and why not use standard diff libraries?
* **Answer:** Our line diff aligner runs in $O(N \cdot W)$ time where $N$ is the number of lines and $W$ is the lookahead window size (20 lines). Since $W$ is a small constant, the complexity is linear $O(N)$ and runs in milliseconds in the browser. Writing a custom aligner avoids external dependencies, keeps the bundle lightweight, and allows us to output standard React state structures matching our styling needs.

---

### Q3: How do you prevent LocalStorage quota limit crashes in your session history manager?
* **Answer:** LocalStorage has a strict 5MB quota. Since we store full multi-agent execution code blocks, the history vault size could eventually exceed this limit. To protect against crashes:
  1. We wrap all read/write operations in a `try...catch` block.
  2. We limit the maximum number of historical sessions stored (e.g., keeping only the 50 most recent records).
  3. When the quota limit is reached (`QuotaExceededError`), we discard the oldest logs to free up space before writing the newest session.

### Q4: Why is it important to run sandbox compile/execution commands inside process-specific timeout structures?
* **Answer:** Spawning compiler execution commands directly on the server host without limits makes the system vulnerable to denial-of-service (DoS) attacks. An infinite loop inside Python or Java consumes 100% CPU, while a command reading blockingly from standard input when no input is provided will hang the child process indefinitely. Spawning child processes with an automated timeout watchdog guarantees they are killed (`SIGKILL`) and system memory is reclaimed.

### Q5: How does your system execute class-only solutions (like LeetCode C++ templates) in a custom test sandbox without compiler link errors?
* **Answer:** Class-only code snippets lack an entry point (`main()`), making them uncompilable directly by standard compiler kernels (resulting in linker errors like `undefined reference to main`). We resolve this by:
  1. **Driver Injection:** The backend parser extracts the LeetCode method signature and dynamically injects a C++ `main()` driver that reads inputs from `stdin`, instantiates the `Solution` class, calls the target method, and prints the result.
# Interview Prep Guide: Phase 5 (Multi-Language Sandbox & Advanced Workspace)

This guide is designed to help you prepare for system design and advanced software engineering interviews, focusing specifically on building multi-language compilation/runtime sandboxes, advanced interactive developer workspace features (Diff views and Session hydration), and universal autonomous agent loop upgrades.

---

## 1. Core Concepts Explained Simply

### Concept A: Multi-Language Sandbox Routing
A sandbox runner must dynamically execute different programming paradigms safely. In our application, we handle compilation-based languages and interpreted languages:
1. **C++ (Ahead-of-Time Compiled):** We write code to `solution_[id].cpp`, compile it to an executable using `g++ -O3`, and execute the compiled binary as a child process.
2. **Python (Interpreted):** Python does not have a separate compile step. We write code directly to `solution_[id].py` and run it via the `python3` (or `python`) interpreter child process.
3. **Java (Class-Based Compiled):** Java has strict filename-to-class mapping rules.
   * **The Challenge:** Java requires the file name to match the `public class` name (e.g. `Main.java` or `Solution.java`). 
   * **Our Solution:** We run a regex matching group to detect the class name from the code, create an isolated directory `java_[id]/` (to prevent class file contamination), write `{ClassName}.java`, compile using `javac`, and run using the JVM interpreter `java -cp java_[id] {ClassName}`.

---

### Concept B: Code Evolution Split-Screen Diff View
When showing code modifications made by a Refiner agent, a standard single-pane text comparison is hard to scan. A side-by-side split screen view requires matching line alignments:
* **The Heuristic:** Our `computeLineDiff` function uses a linear lookahead matching algorithm.
* **How it works:** It processes lines from both files concurrently using index pointers `oldIdx` and `newIdx`. If lines mismatch, it searches ahead up to 20 lines:
  1. If the current `newLine` is found further down in `oldLines`, it indicates lines were **deleted** from the original code. We align by pushing blank lines into the right panel.
  2. If the current `oldLine` is found further down in `newLines`, it indicates lines were **added** to the new code. We align by pushing blank lines into the left panel.
  3. If no match is found within the lookahead window, it treats the mismatch as a direct replacement/addition/deletion.
* **Why this is critical:** It ensures unchanged lines align horizontally on both left and right panes, creating a clean premium diff view.

---

### Concept C: Local Session History Vault
Single Page Applications (SPAs) lose their state on page refreshes.
* **Session vault:** When a solver execution completes, the app automatically serializes the entire state tree: problem description, custom system prompts, rounds history, code evolution drafts, and execution times, saving it under a unique timestamp in `localStorage`.
* **Hydration:** To restore a session, the app pulls the payload from `localStorage`, resets all current execution variables, and populates the React state variables simultaneously. This updates the bento grid dashboard elements, timeline pills, and code panels instantly.

---

### Concept D: Dynamic Edge-Case Sandbox Synthesis
Relying on hardcoded or human-written test cases is unscalable. In the execution preparation phase:
* **Adversarial Synthesis:** The orchestrator utilizes a dedicated prompt block that parses the problem description, extracts mathematical boundaries/constraints, and synthesizes a matrix of exactly 5 diverse adversarial test cases.
* **Coverage Scope:** The cases are generated to hit standard edge profiles:
  1. **Maximum limits** (upper bounds of input sizes/values).
  2. **Negative/Empty/Zero states** (empty lists, negative values, N=0/N=1 limits).
  3. **Uniform elements** (all inputs are identical, like an array of uniform elements).
  4. **Average standard cases**.
  5. **Logical overflow boundaries** (inputs triggering arithmetic overflows, prime cases, etc.).
* **Wired Execution:** Generated test cases are passed into the sandbox compiled executions, forcing the solution to prove its correctness against a high-coverage suite from the start.

---

### Concept E: Universal Algorithmic Critic Framework
Instead of parsing basic keyword matches to critique code, the Critic agent employs a mathematical evaluation template:
* **Internal Classification:** The Critic reads the problem criteria and classifies the algorithmic family (e.g. Dynamic Programming, Graph Theory, Greedy, Segment Trees, Bit Manipulation).
* **Complexity Benchmarking:** It establishes the standard optimal time/space complexity bounds for that class of problems (e.g. $O(N)$ for prefix sums or $O(V+E)$ for graph BFS).
* **Strict Evaluation:** It parses the solution's actual structure, cross-verifies its complexity bounds, and rejects the code if it fails to hit standard category benchmarks.

---

### Concept F: Generic Error Rectification Loop
Debugging code requires piping sandbox stderr streams straight back to the next prompt iterations.
* **Fault Logging:** If any test case fails inside the sandbox with compilation flags, timeout exceptions (TLE), or runtime exceptions (RTE/segfaults), the orchestrator intercepts the raw execution results and appends standard error output logs (`stderr`) directly into the `criticismHistory` object.
* **Correction-Aware Polishing**: The subsequent Coder prompt and the final Refiner agent ingest the historical stderr streams, ensuring that the refined code draft fixes compilation syntax faults and memory leaks before finalizing the solution.

---

### Concept G: Extending Sandbox Kernels (Adding New Languages)
To add a new language kernel (e.g., Go or Rust) in the future, follow this sequence:
1. **Frontend Update:** Add the target language identifier option to the dropdown selector in `frontend/src/App.jsx`.
2. **Sandbox Router Extension:** Modify the `executeCpp` function in `backend/src/executor/cppExecutor.js`:
   * Define file extensions (e.g., `.go`, `.rs`).
   * Specify compile instructions (e.g., `go build` or `rustc`).
   * Route process executions with correct spawned arguments.
3. **Agent Schema Configuration:** Extend the schema descriptions inside `coderAgent.js` and `refinerAgent.js` to dynamically inject the syntax rules of the new language into the Gemini structured JSON schemas.

---

## 2. Top Interview Questions & Answers

### Q1: How does your Java sandbox execution prevent class name conflicts and namespace pollution?
* **Answer:** Since Java compiled `.class` files are placed on disk, compiling multiple Java solutions with default class names (like `Main` or `Solution`) in the same directory leads to class overwriting and race conditions. We resolve this by:
  1. Parsing the class name dynamically from the source code via regex.
  2. Creating a unique isolated directory for every execution run (e.g., `temp/java_[id]`).
  3. Writing and compiling the file inside that folder.
  4. Spawning the JVM with classpath arguments specifying the subfolder (`java -cp temp/java_[id] ClassName`).
  5. Deleting the entire directory recursively inside the `finally` block to prevent disk-space leaks.

---

### Q2: What is the complexity of your custom split-screen diff algorithm, and why not use standard diff libraries?
* **Answer:** Our line diff aligner runs in $O(N \cdot W)$ time where $N$ is the number of lines and $W$ is the lookahead window size (20 lines). Since $W$ is a small constant, the complexity is linear $O(N)$ and runs in milliseconds in the browser. Writing a custom aligner avoids external dependencies, keeps the bundle lightweight, and allows us to output standard React state structures matching our styling needs.

---

### Q3: How do you prevent LocalStorage quota limit crashes in your session history manager?
* **Answer:** LocalStorage has a strict 5MB quota. Since we store full multi-agent execution code blocks, the history vault size could eventually exceed this limit. To protect against crashes:
  1. We wrap all read/write operations in a `try...catch` block.
  2. We limit the maximum number of historical sessions stored (e.g., keeping only the 50 most recent records).
  3. When the quota limit is reached (`QuotaExceededError`), we discard the oldest logs to free up space before writing the newest session.

### Q4: Why is it important to run sandbox compile/execution commands inside process-specific timeout structures?
* **Answer:** Spawning compiler execution commands directly on the server host without limits makes the system vulnerable to denial-of-service (DoS) attacks. An infinite loop inside Python or Java consumes 100% CPU, while a command reading blockingly from standard input when no input is provided will hang the child process indefinitely. Spawning child processes with an automated timeout watchdog guarantees they are killed (`SIGKILL`) and system memory is reclaimed.

### Q5: How does your system execute class-only solutions (like LeetCode C++ templates) in a custom test sandbox without compiler link errors?
* **Answer:** Class-only code snippets lack an entry point (`main()`), making them uncompilable directly by standard compiler kernels (resulting in linker errors like `undefined reference to main`). We resolve this by:
  1. **Driver Injection:** The backend parser extracts the LeetCode method signature and dynamically injects a C++ `main()` driver that reads inputs from `stdin`, instantiates the `Solution` class, calls the target method, and prints the result.
  2. **State Synchronization:** To run custom tests after a backend LeetCode scrap, the backend synchronizes the fetched description and templates back to the client React state. When the client requests a custom sandbox run, it passes this synchronized metadata in the WebSocket payload, allowing the compiler to always build the correct driver and preventing Coder agent hallucinations.

---

## 3. Conceptual Errors & Resolved Issues Vault

### Vault Entry 1: Custom Sandbox Driver Linkage & Client State Desynchronization
* **The Conceptual Error:** Decoupling sandbox execution runs from active problem metadata.
* **The Symptom:** Running a verification solve via a LeetCode URL worked, but clicking "Run Custom Test" compiled the class directly without a `main()` function, triggering linker errors. The frontend automatically re-triggered a debate, but because the scraped description was cached on the backend and not synchronized with the client, it submitted an empty description, causing the Coder agent to hallucinate a completely unrelated solution (`maxAlternatingSum`).
* **The Remedy:** 
  1. Emitted the scraped problem metadata back to the client upon debate completion to update the React state.
  2. Passed the problem description in the `run_custom_test` socket event so the backend has the context needed to inject the compiler driver.
  3. Removed the auto-trigger debate hook on manual sandbox runs so that custom run outputs are strictly logged, leaving code-correction control to the developer.

### Vault Entry 2: Redis Message Queue Cache & Compilation Signature Fallback
* **The Conceptual Error:** Relying on transient client states and persistent message queue cache outputs for code signature parsing.
* **The Symptom:** If a user re-ran verification in a workspace where the job ID was cached in Redis (from a previous codebase iteration that did not store problemDescription in the final results), the client-side socket listener received the cached queue output without any `problemDescription` payload. When launching a custom sandbox run, the compiler lacked the template definition to extract the class method signature, causing g++ to fail with an `undefined reference to 'WinMain@16'` or `undefined reference to 'main'` linker error.
* **The Remedy:** 
  1. **Server-Side In-Memory Cache:** Added an in-memory Map (`jobProblemDescriptions`) on the backend server that caches scraped problem descriptions on completion and serves them to custom test requests matching the target `jobId`.
  2. **Sandbox Signature Parsing Fallback:** Updated the compiler sandbox templates to fallback directly to parsing the user's active editor code if the problem description template is missing or empty. This extracts the signature directly from the `class Solution` code body itself, ensuring successful driver generation.

### Vault Entry 3: Syntax Highlighting vs. Interactive Code Input & Debug-in-Debate Loops
* **The Conceptual Error:** Restricting user workspaces to static read-only views and separating sandbox execution feedback loops from agent orchestration pipelines.
* **The Symptom:** Users could copy/download code, but couldn't fix minor bugs or write test code directly in the browser because the code workspace was built as a static line-by-line syntax-highlighted display. Additionally, when a custom test failed or returned wrong outputs, there was no way to guide the agent debate to correct the code using that specific failing test input.
* **The Remedy:** 
  1. **Dual-Mode Interactive Editor:** Added a state-controlled toggle (`isEditingCode`) to the workspace header. When active, it swaps the static line-by-line syntax highlighter for an interactive dark-themed `<textarea>` with built-in Tab key indentation handlers (inserting 4 spaces instead of shifting focus).
  2. **Live State Synchronization:** Prioritized `liveCode` at the top of `getFinalSolutionCode()`, turning the editor textarea value into the single source of truth for the entire workspace.
  3. **Debug-in-Debate Orchestration:** Added an interactive `🐞 Debug with Agent Debate` action inside the custom results box. When triggered, it prompts the user for the expected output (if the run succeeded logically but returned wrong results), formats the input and expected output as a new LeetCode Example block, appends it to the active description, and launches a fresh debate. The agent loop automatically parses the new example and compiles/tests the solution against it until it passes.

