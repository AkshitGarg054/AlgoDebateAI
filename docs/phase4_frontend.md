# Interview Prep Guide: Phase 4 (The Frontend Dashboard & WebSockets)

This guide is designed to help you prepare for full-stack and frontend system design interviews, focusing on real-time event streaming and premium web UI architectures.

---

## 1. Core Concepts Explained Simply

### Concept A: WebSockets vs. HTTP Polling
* **HTTP Polling (Old Way):** The browser repeatedly asks the server: *"Is the job done yet?"* every 2 seconds.
  * **Trade-off:** High server load, wasted bandwidth, and delayed UI updates.
* **WebSockets (Our Way - Socket.io):** The browser establishes a single, open TCP connection to the server. The server can push updates to the browser whenever they happen.
  * **Trade-off:** Minimal overhead, instant updates, and highly efficient.

---

### Concept B: What is CORS (Cross-Origin Resource Sharing)?
* **The Rule:** By default, browsers block websites from making API requests to a different domain or port to prevent malicious sites from reading your private data.
* **Our App:**
  * Frontend runs on `http://localhost:5173`.
  * Backend runs on `http://localhost:5000`.
* **Our Solution:** We configure Express and Socket.io on the backend to include `cors` headers, specifically authorizing `http://localhost:5173` to make requests and establish websocket streams.

---

### Concept C: Designing Glassmorphism UI
* **What it is:** A UI trend that mimics frosted glass. 
* **Key CSS properties we used:**
  1. `background: rgba(15, 20, 32, 0.7)` (semi-transparent dark background).
  2. `backdrop-filter: blur(20px)` (blurs whatever is behind the card, creating the frosted glass effect).
  3. `border: 1px solid rgba(255, 255, 255, 0.08)` (gives the card a sharp glass edge).

---

### Concept D: Real-time Node Highlighting (State Mapping)
* We map the current `activeNode` state in React directly to CSS classes:
  ```jsx
  className={`graph-node ${activeNode === 'coder' ? 'active-pulse active-coder' : ''}`}
  ```
* When `activeNode` equals `'coder'`, CSS applies an `active-pulse` keyframe animation that scales the node slightly and oscillates a neon-blue shadow, signaling to the user exactly where the LangGraph execution is.

---

## 2. Top Interview Questions & Answers

### Q1: What is CORS, and why did you have to configure it in this project?
* **Answer:** CORS stands for Cross-Origin Resource Sharing. It is a browser security mechanism that restricts resources on a web page from being requested from another domain outside the domain from which the first resource was served. Because our Vite React app runs on port 5173 and our Node.js server runs on port 5000, they are considered different origins. We had to configure CORS on the backend to explicitly allow port 5173, enabling the browser to proceed with HTTP requests and WebSocket handshakes.

---

### Q2: What is the difference between WebSockets and HTTP long-polling?
* **Answer:** 
  * **WebSockets** establish a single, persistent, full-duplex TCP connection. Both client and server can send data at any time with extremely low frame overhead. It is ideal for highly real-time, bidirectional streaming apps.
  * **HTTP Long-Polling** sends standard HTTP requests. If the server has no data, it hangs onto the request until data is available, sends it, closes the connection, and the client immediately opens a new request. It has high header overhead and places heavy load on the server's thread count.

---

### Q3: How did you bridge background worker events (BullMQ) to the client's browser?
* **Answer:** We used an event-driven observer pattern. The BullMQ worker emits process events (like `'progress'`, `'completed'`, and `'failed'`). In our main server entry point (`index.js`), we subscribe to these worker events. When the worker updates its status, we catch the event and emit a socket message containing the progress payload to a job-specific channel (e.g. `job-progress:${jobId}`). The client listens to this channel and updates its React state dynamically.

---

### Q4: How does your frontend handle user browser refreshes without losing job progress?
* **Answer:** We implemented a recovery endpoint `GET /api/debate/:jobId`. When a user submits a job, we store the `jobId` in the application state. If the user refreshes their browser, the client checks if there is an active `jobId` in the session. It queries our GET endpoint. The backend looks up the job in Redis (`debateQueue.getJob(jobId)`), fetches its current state and progress history, and returns it to the client, allowing the UI to reconstruct the exact state of the debate seamlessly.


## Custom Testing & The Debate Debugger

To handle edge cases without running the entire suite, a **Custom Test Panel** was implemented using a glassmorphic React Modal. 

If a test case fails, a direct hook (`handleLaunchDebugDebate`) calls a specialized endpoint `/api/debate/debug` which injects the failed test output directly into the Critic agent's prompt, triggering an **Agent Debate Debug** round. This demonstrates the immense flexibility of LangGraph state architectures—allowing branching states from arbitrary frontend triggers.
