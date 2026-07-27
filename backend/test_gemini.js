import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.log('No API key found in .env');
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey });

async function test() {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: 'Respond with OK',
    });
    console.log('SUCCESS:', response.text);
  } catch (error) {
    console.error('ERROR:', error);
  }
}
test();
