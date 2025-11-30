// Copyright ©2025 Hicham. All rights reserved.

// --- 1. Import Required Libraries ---
// We use 'express' to create the server and handle routes.
// We use 'node-fetch' (implicitly via Node.js v18+) to call external APIs.
// We use 'dotenv' to securely manage our API key.
// We use 'marked' to parse markdown from the AI's response into safe HTML.
// We use 'path' and 'url' to correctly locate our index.html file.
import express from 'express';
import { OpenRouter } from '@openrouter/sdk';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

// --- 2. Server Setup ---
const app = express();
const port = process.env.PORT || 3000; // Use port from environment or default to 3000

// Helper to get the current directory name (required for ES Modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 3. Initialize OpenRouter Client ---
const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});


// --- PRE-STARTUP CHECK ---
// This is a critical check to ensure the server doesn't start with a fatal configuration error.
if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("FATAL ERROR: OPENROUTER_API_KEY environment variable is not set.");
}

// --- 4. Middleware ---
// This tells Express to automatically handle JSON data in requests.
app.use(express.json());

// --- 5. Define Routes ---

// This route serves your main 'index.html' page when someone visits your website.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// This is the API endpoint that your frontend calls.
app.post('/ask', async (req, res) => {
  try {
    const { question, imageUrl } = req.body;

    if (!question && !imageUrl) {
      return res.status(400).json({ error: 'Question or Image URL is required.' });
    }

    const model = 'google/gemini-2.0-flash-exp:free'; // Use the free, experimental Gemini Flash model
    let messages;

    // Prepare messages for the API call, handling images if provided
    if (imageUrl) {
      messages = [{
        role: 'user',
        content: [
          { type: 'text', text: question || "What is in this image?" },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }];
    } else {
      messages = [
        { role: 'system', content: 'You are a helpful legal assistant. Provide clear, concise, and accurate information. Your answers should be in the same language as the user\'s question (English, French, or Arabic).' },
        { role: 'user', content: question },
      ];
    }

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Call the OpenRouter API with streaming enabled
    const stream = await openrouter.chat.completions.stream({
      model: model,
      messages: messages,
      stream: true,
    });

    // Process the stream and send chunks to the client
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        // Write each chunk in the SSE format
        res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
      }
    }

    // Send a final 'done' message and end the connection
    res.write('data: {"done": true}\n\n');
    res.end();

  } catch (error) {
    console.error('Error in /ask streaming route:', error);
    // If an error occurs, we can't send a JSON error response as the headers are already set.
    // We just end the request. The client-side will handle the broken connection.
    res.end();
  }
});

// --- 6. Global Error Handling Middleware ---
// This middleware will catch any errors that occur in your routes.
// It's a safety net to ensure your server always sends back a predictable JSON error.
app.use((err, req, res, next) => {
  console.error('An unexpected error occurred:', err);
  res.status(500).json({ error: 'An internal server error occurred.' });
});

// --- 6. Start the Server ---
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log('Your Legal AI Assistant is ready!');
});