# Phase 6: Dockerization & Deployment Architecture

This document outlines the deployment strategy, focusing on how Docker is utilized to host our multi-language AI sandbox and how external services (like Upstash Redis) fit into the production architecture.

## Why Do We Need Docker?

Normally, Node.js applications are deployed to serverless platforms (like Vercel Functions or AWS Lambda) or standard PaaS (Platform as a Service) providers. 
However, **AlgoDebate AI** is unique: the backend orchestrator (`executor/` directory) actively compiles and runs C++, Python 3, and Java files directly on the host machine. 

Standard serverless environments do not have `g++`, `python3`, or `javac` installed. Furthermore, serverless platforms prevent writing to the local filesystem (which we need for `temp_sandbox` files) and aggressively timeout WebSockets.

**Docker solves this by letting us package our own "Custom Operating System".**
A Docker container is essentially a lightweight, isolated Linux machine. Using our `Dockerfile`, we start with a bare-bones Linux system (`node:18-bullseye-slim`) and run terminal commands to install the exact compilers we need before starting the Node.js server.

### The Dockerfile Explained

```dockerfile
# 1. Base Image: We start with a lightweight Debian Linux OS that has Node.js 18 pre-installed.
FROM node:18-bullseye-slim

# 2. Install Compilers: We run the Linux package manager (apt-get) to install C++, Python, and Java.
RUN apt-get update && apt-get install -y \
    g++ \
    python3 \
    default-jdk \
    && rm -rf /var/lib/apt/lists/*

# 3. Workspace: We create a folder called /app inside the container and move into it.
WORKDIR /app

# 4. Dependencies: We copy our package.json and install all npm packages.
COPY package*.json ./
RUN npm install

# 5. Source Code: We copy the rest of the backend files into the container.
COPY . .

# 6. Expose Port: We tell Docker that our Express server will listen on port 5000.
EXPOSE 5000

# 7. Start Command: The command Docker runs to start our application.
CMD ["npm", "run", "start"]
```

## How It Works with Render

[Render.com](https://render.com) is a modern cloud hosting platform. When you create a **Web Service** on Render and point it to your GitHub repository:
1. Render scans your repository and finds the `Dockerfile`.
2. It provisions a virtual machine, builds the container exactly according to our instructions (installing all compilers), and launches it.
3. This creates a secure, sandboxed environment in the cloud where our backend can freely execute user-submitted code without risking the host system.

## Transitioning from Local Redis to Cloud Redis (Upstash)

Locally, we used Docker to run a Redis server for BullMQ. In production, spinning up a separate Redis container on Render costs extra money.

Instead, we use **Upstash**, which provides a "Serverless Redis" database for free.
Upstash gives us a connection string (e.g., `redis://default:password@endpoint.upstash.io:30000`). 

We updated `backend/src/orchestrator/queue.js` to intelligently connect to this remote URL if it exists in our Environment Variables:

```javascript
const connection = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || {
  host: 'localhost',
  port: 6379
};
```

### Final Deployment Checklist
1. **Frontend:** Deployed to Vercel (Free).
2. **Redis Database:** Deployed to Upstash (Free). *Copy the Redis URL they give you.*
3. **Backend:** Deployed to Render as a Docker Web Service (Free). 
   - Add `GEMINI_API_KEY` to Render's Environment Variables.
   - Add `UPSTASH_REDIS_URL` to Render's Environment Variables.
