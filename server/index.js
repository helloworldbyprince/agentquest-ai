import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testGeminiConnection } from './gemini.js';

// Load environment variables from .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Gemini Connection Test Endpoint
app.post('/api/gemini/test', async (req, res) => {
  const result = await testGeminiConnection();
  return res.status(result.status).json(result.data);
});

// Start listening if run directly
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[AgentQuest Backend] Express server running on port ${PORT}`);
    console.log(`[AgentQuest Backend] Health check: http://localhost:${PORT}/api/health`);
  });
}

export default app;

