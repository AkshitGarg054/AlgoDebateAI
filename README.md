# AlgoDebate AI: Multi-Agent Multi-Language Logic Solver

AlgoDebate AI is an advanced, full-stack agentic coding assistant that writes, compiles, tests, and refines algorithm solutions across **C++**, **Python 3**, and **Java**. It uses a **multi-agent debate system** powered by **Google Gemini** and orchestrated via **LangGraph**, complete with a local **Multi-Language Sandbox Compiler & Executor** and a real-time **WebSockets-based Glassmorphic UI Dashboard**.

Rather than running simple linear pipelines, the system implements a **self-correcting cycle**: the Coder drafts code, the Sandbox compiles and executes it across native toolchains, the Critic reviews runtime reports to locate logical or efficiency bugs, and the Refiner documents the final optimized code.

---

## 🏗️ System Architecture & Workflow

The orchestrator is built on top of `@langchain/langgraph` using a stateful directed graph. The workflow moves dynamically through nodes and conditional edges based on the selected language (`C++`, `Python`, or `Java`):

```
                  ┌──────────────────────┐
                  │        START         │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
            ┌────►│  1. Coder Node       │
            │     └──────────┬───────────┘
            │                │
            │                ▼
            │     ┌──────────────────────┐
            │     │  2. Sandbox Executor │
            │     └──────────┬───────────┘
            │                │
            │                ▼
            │     ┌──────────────────────┐
            │     │  3. Critic Node      │
            │     └──────────┬───────────┘
            │                │
            │                ▼ (Conditional Edge)
            │      Is Approved / Max Rounds?
            │       /                    \
            │     No                     Yes
            │     /                        \
            └────┘                          ▼
                                  ┌──────────────────┐
                                  │ 4. Refiner Node  │
                                  └────────┬─────────┘
                                           │
                                           ▼
                                  ┌──────────────────┐
                                  │       END        │
                                  └──────────────────┘
```

### The Node Roles:
1. **Coder Node (`coderAgent.js`):** Generates drafts in the target language (`C++`, `Python 3`, or `Java`) with exact function signatures (e.g. `vector<int>&` for C++, `List[int]` for Python, `int[]` for Java). Synthesizes custom boundary test cases. If a history of criticism exists from previous rounds, it applies targeted refactoring.
2. **Sandbox Executor (`cppExecutor.js`):** Writes code to temporary sandbox files and runs execution pipelines:
   * **C++:** Compiled natively using `g++` with `-O3` optimization.
   * **Python 3:** Executed via `python3`/`python` with an auto-injected `sys.stdin` driver to handle in-place return methods (e.g. `def nextPermutation(...) -> None`).
   * **Java:** Compiled via `javac` and executed via `java` with class signature verification.
   * Traps compiler/interpreter errors, Runtime Exceptions (RTE), and runs watchdog timers to prevent infinite loops (Time Limit Exceeded - TLE).
3. **Critic Node (`criticAgent.js`):** Audits sandbox reports, verifies solution logic, and identifies time/space inefficiencies. Evaluates target language execution streams dynamically and generates breaking test cases if buggy.
4. **Refiner Node (`refinerAgent.js`):** Extracts code cleanly from markdown fences (` ```cpp `, ` ```python `, ` ```java `) without stub/fallback overwrites. Inserts documentation comments, states exact time/space complexities, and streams results directly to the WebSocket payload.

---

## 🛠️ Technology Stack & Prerequisites

### Technology Stack:
* **Frontend:** React (Vite), Socket.io-client, CSS Custom variables (Vanilla CSS).
* **Backend:** Node.js (Express, Socket.io, BullMQ, Redis, `@google/genai` SDK, `@langchain/langgraph`).
* **Compilers & Runtimes:**
  * **C++:** Native `g++` compiler (supporting `-O3` compilation optimization).
  * **Python 3:** `python3` / `python` interpreter with `typing`, `collections`, `math`, `sys`, and `json` modules.
  * **Java:** `javac` compiler and `java` runtime engine (supporting `java.util.*`, `java.io.*`, `java.math.*`).
* **AI Model:** `gemini-flash-lite-latest` (fast, structured JSON response outputs).

---

## ✨ Key Engineering Highlights

### 1. Multi-Language Dynamic Selection & Sandbox Runner
The engine dynamically binds the user-selected language (`C++`, `Python`, or `Java`) across Coder, Critic, and Refiner agent prompts and sandbox runners:
* **C++:** Enforces `class Solution { public: ... };` with STL containers.
* **Python 3:** Enforces `class Solution:` with `def methodName(self, ...)` signatures and handles in-place modification return types (`None`).
* **Java:** Enforces `class Solution` with `public ReturnType methodName(...)` and primitive/object array signatures.

### 2. WebSocket Race-Condition Resolution
During local execution, background jobs finish in milliseconds. If the client queries the backend first, the job starts and progress events are broadcast *before* the React client resolves its fetch response and registers the socket listener.
* **The Fix:** Implemented **Client-Side ID Generation**. The frontend pre-generates a unique `jobId`, registers WebSocket listeners synchronously on the client, and *then* submits the HTTP POST request. This guarantees zero lost events.

### 3. Clean Code Extraction & Zero-Overwrite Guarantee
The Refiner agent cleanly parses markdown code blocks (` ```python `, ` ```java `, ` ```cpp `) and streams extracted code directly through WebSocket event payloads without falling back to C++ stubs when Python or Java execution finishes.

### 4. Glassmorphic Pipeline Status Engine
The visualizer acts as an active CI/CD pipeline. Nodes dynamically update states (`pending`, `active`, `completed`, `failed`) and display dynamic Verification Confidence progression (`0%` -> `25%` -> `50%` -> `75%` -> `100%`) with smooth hardware-accelerated animations.

---

## 🚀 Local Development Setup

### Prerequisites
Make sure you have the following installed and available in your system `PATH`:
* **Node.js** (v18+)
* **Docker** (to run the Redis server)
* **Host Compilers & Toolchains:**
  * **G++ Compiler:** `g++ --version` (Windows: MinGW/MSYS2; Linux/macOS: `build-essential` / `gcc`)
  * **Python 3:** `python --version` or `python3 --version`
  * **Java SDK:** `javac -version` and `java -version`

---

### Step-by-Step Setup

#### 1. Clone & Navigate
```bash
git clone <your-repo-url>
cd AlgoDebateAI
```

#### 2. Start Redis Container
Start a Docker container running Redis on port `6379` (needed by BullMQ):
```bash
docker run --name algodebate-redis -p 6379:6379 -d redis
```

#### 3. Setup Backend Environment
Navigate to the `backend` folder, install packages, and configure variables:
```bash
cd backend
npm install
```
Create a `.env` file inside the `backend/` folder:
```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
PORT=5000
```

#### 4. Setup Frontend Client
Navigate to the `frontend` folder and install dependencies:
```bash
cd ../frontend
npm install
```

#### 5. Run the Application
Start both the backend server and the frontend client:

* **In Backend Directory:**
  ```bash
  npm run start # (or: node src/index.js)
  ```
  *(Starts the Express server, Socket server, and BullMQ Background Worker).*

* **In Frontend Directory:**
  ```bash
  npm run dev
  ```
  *(Starts the Vite dev server on http://localhost:5173).*

Open your browser to **[http://localhost:5173](http://localhost:5173)** to start using the app!

---

## 📂 Folder Structure

```
AlgoDebateAI/
│
├── backend/
│   ├── src/
│   │   ├── agents/            # Coder, Critic, and Refiner agents
│   │   ├── executor/          # Multi-Language sandbox (C++, Python, Java)
│   │   ├── orchestrator/      # LangGraph state machine & BullMQ worker
│   │   └── index.js           # Server entry point (Express & Sockets)
│   │
│   ├── tests/                 # Execution verification suites
│   ├── .env                   # Environmental configuration (Ignored)
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Main dashboard component
│   │   ├── App.css            # Component-specific styles
│   │   ├── index.css          # Design system & keyframes
│   │   └── main.jsx           # Vite React loader
│   │
│   └── package.json
│
├── docs/                      # Interview preparation guides
│   ├── phase1_sandbox.md      # Sandbox execution details
│   ├── phase2_agents.md       # Agent prompting & structured schemas
│   ├── phase3_langgraph.md    # LangGraph state design & reducers
│   ├── phase4_frontend.md     # WebSockets, CORS, and full-stack architecture
│   └── websockets_race_condition.md # Diagnostic guide on race conditions
│
├── .gitignore                 # Secure git exclusions
└── README.md
```

---

## 📚 Interview Preparation & Revision
For deep dives into the technical design decisions, trade-offs, and typical system design interview questions relating to this architecture, check out the markdown guides inside the `docs/` folder!
