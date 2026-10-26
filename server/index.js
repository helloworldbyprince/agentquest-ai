import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  testAIConnection,
  startAgentSession,
  stepAgentSession,
  stopAgentSession
} from './providers/manager.js';

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

// AI Connection Test Endpoint (Tests Groq primary, Gemini fallback)
app.post('/api/gemini/test', async (req, res) => {
  const result = await testAIConnection();
  return res.status(result.status).json(result.data);
});

app.post('/api/ai/test', async (req, res) => {
  const result = await testAIConnection();
  return res.status(result.status).json(result.data);
});

// Autonomous Agent Endpoints
app.post('/api/agent/session/start', async (req, res) => {
  const { startPos, forceProvider } = req.body || {};
  const result = await startAgentSession({ startPos, forceProvider });
  return res.status(result.status).json(result.data);
});

app.post('/api/agent/session/step', async (req, res) => {
  const { sessionId, toolResponse } = req.body || {};
  const result = await stepAgentSession({ sessionId, toolResponse });
  return res.status(result.status).json(result.data);
});

app.post('/api/agent/session/stop', (req, res) => {
  const { sessionId } = req.body || {};
  const result = stopAgentSession(sessionId);
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
