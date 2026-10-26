/**
 * Autonomous AI Agent Controller
 * Re-exports from multi-provider manager for backwards compatibility and modularity.
 */

export {
  startAgentSession,
  stepAgentSession,
  stopAgentSession,
  getActiveSessionsCount,
  getSession,
  testAIConnection
} from './providers/manager.js';

export {
  AGENT_SYSTEM_INSTRUCTION,
  GEMINI_TOOLS_CONFIG as AGENT_TOOLS_CONFIG,
  GROQ_TOOLS,
  classifyProviderError,
  normalizeToolCall
} from './providers/base.js';
