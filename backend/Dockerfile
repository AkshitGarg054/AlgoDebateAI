FROM node:18-bullseye-slim

# Install C++, Python, and Java compilers required for the sandbox
RUN apt-get update && apt-get install -y \
    g++ \
    python3 \
    default-jdk \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# Copy package files and install Node.js dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the backend source code
COPY . .

# Expose the port the Express server runs on
EXPOSE 5000

# Start the server
CMD ["npm", "run", "start"]
