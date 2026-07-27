import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Reconstruct __dirname for ES Modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environmental variables from the .env file in the backend root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
  console.error('Error: Please open the backend/.env file and replace "YOUR_API_KEY_HERE" with your actual Gemini API Key.');
  process.exit(1);
}

// 1. Initialize the GoogleGenAI client with our key
const ai = new GoogleGenAI({ apiKey });

async function testConnection() {
  console.log('Attempting to connect to Gemini API...');
  
  // 2. We use gemini-2.0-flash for high availability on the free tier
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: 'Say hello and say: "I am connected to AlgoDebate AI!"',
  });

  console.log('\n======================================');
  console.log('API RESPONSE RECEIVED:');
  console.log('======================================');
  console.log(response.text.trim());
  console.log('======================================');
}

testConnection().catch(err => {
  console.error('\nAPI Connection Failed! Error details:');
  console.error(err);
});
