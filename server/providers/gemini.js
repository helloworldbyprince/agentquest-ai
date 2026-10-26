import { GoogleGenAI } from '@google/genai';
import {
  AGENT_SYSTEM_INSTRUCTION,
  GEMINI_TOOLS_CONFIG,
  classifyProviderError,
  normalizeToolCall
} from './base.js';

export const GEMINI_CANDIDATE_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash',
  'gemini-flash-latest'
];

export class GeminiProvider {
  constructor({
    apiKey = null,
    modelName = null
  } = {}) {
    this.name = 'gemini';
    this.displayName = 'Gemini Flash-Lite';
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.client = null;
  }

  getApiKey() {
    return this.apiKey || process.env.GEMINI_API_KEY;
  }

  getModelName() {
    return this.modelName || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  }

  isConfigured() {
    const key = this.getApiKey();
    return Boolean(key && key.trim() !== '' && key !== 'your_gemini_api_key_here');
  }

  getClient() {
    const key = this.getApiKey();
    if (!key || key === 'your_gemini_api_key_here') return null;
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: key });
    }
    return this.client;
  }

  getCandidateModels(preferredModel) {
    const primary = preferredModel || this.getModelName();
    return Array.from(new Set([primary, ...GEMINI_CANDIDATE_MODELS]));
  }

  /**
   * Performs connection test against Gemini with fallback across candidate models
   */
  async testConnection({ timeoutMs = 12000 } = {}) {
    if (!this.isConfigured()) {
      return {
        status: 400,
        data: {
          success: false,
          provider: this.name,
          error: 'GEMINI_API_KEY is not configured on the server. Please check your .env file.'
        }
      };
    }

    const client = this.getClient();
    const model = this.getModelName();
    const candidates = this.getCandidateModels();
    let lastError = null;
    let lastModel = model;

    for (let i = 0; i < candidates.length; i++) {
      const activeModel = candidates[i];
      lastModel = activeModel;

      const activeTimeout = Math.min(timeoutMs, 4500);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), activeTimeout)
      );

      try {
        const generatePromise = client.models.generateContent({
          model: activeModel,
          contents: 'Reply with exactly: AgentQuest AI connection successful.'
        });

        const response = await Promise.race([generatePromise, timeoutPromise]);
        const text = response.text ? response.text.trim() : 'AgentQuest AI connection successful.';

        return {
          status: 200,
          data: {
            success: true,
            provider: this.name,
            model: activeModel,
            message: text,
            fallbackFrom: activeModel !== model ? model : undefined
          }
        };
      } catch (error) {
        lastError = error;
        const classification = classifyProviderError(error);

        // Fatal auth error — stop immediately
        if (classification.isAuthError) {
          return {
            status: 401,
            data: {
              success: false,
              provider: this.name,
              model: activeModel,
              error: classification.message
            }
          };
        }

        // If fallbackable and more candidates remain, continue
        if (classification.isFallbackable && i < candidates.length - 1) {
          console.warn(`[AgentQuest Gemini] Model "${activeModel}" failed (${classification.message.slice(0, 80)}). Trying "${candidates[i + 1]}"...`);
          continue;
        }

        break;
      }
    }

    const classification = classifyProviderError(lastError);
    return {
      status: classification.status,
      data: {
        success: false,
        provider: this.name,
        model: lastModel,
        error: classification.message
      }
    };
  }

  /**
   * Starts a new session on Gemini with candidate model fallback
   */
  async startSession({ startPos = { row: 7, col: 1 }, modelName = null, timeoutMs = 15000 } = {}) {
    if (!this.isConfigured()) {
      throw new Error('GEMINI_API_KEY is not configured.');
    }

    const client = this.getClient();
    const preferredModel = modelName || this.getModelName();
    const initialPrompt = `Mission started. You are positioned at row ${startPos.row}, column ${startPos.col} in an unknown 9×9 maze. Your mission: Find the key, unlock the locked door, and reach the exit. What tool do you want to call first?`;

    const candidates = this.getCandidateModels(preferredModel);
    let lastError = null;

    for (let i = 0; i < candidates.length; i++) {
      const activeModel = candidates[i];
      const activeTimeout = Math.min(timeoutMs, 4500);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), activeTimeout)
      );

      try {
        const chat = client.chats.create({
          model: activeModel,
          config: {
            systemInstruction: AGENT_SYSTEM_INSTRUCTION,
            tools: GEMINI_TOOLS_CONFIG
          }
        });

        const sendPromise = chat.sendMessage({ message: initialPrompt });
        const response = await Promise.race([sendPromise, timeoutPromise]);

        let toolCall = null;
        if (response.functionCalls && response.functionCalls.length > 0) {
          const call = response.functionCalls[0];
          toolCall = normalizeToolCall(call.name, call.args);
        } else {
          toolCall = { name: 'look', args: {} };
        }

        return {
          provider: this.name,
          model: activeModel,
          fallbackFrom: activeModel !== preferredModel ? preferredModel : null,
          toolCall,
          thought: response.text ? response.text.trim() : null,
          chat
        };
      } catch (error) {
        lastError = error;
        const classification = classifyProviderError(error);

        if (classification.isAuthError) {
          throw error;
        }

        if (classification.isFallbackable && i < candidates.length - 1) {
          console.warn(`[AgentQuest Gemini] startSession failed on "${activeModel}": ${classification.message.slice(0, 80)}. Falling back to "${candidates[i + 1]}"...`);
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Advances the Gemini session with a tool response
   */
  async stepSession({ chat, toolResponse, activeModel, timeoutMs = 15000 } = {}) {
    if (!this.isConfigured()) {
      throw new Error('GEMINI_API_KEY is not configured.');
    }

    const responsePart = {
      functionResponse: {
        name: toolResponse.name,
        response: toolResponse.response || { status: 'completed' }
      }
    };

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), timeoutMs)
    );

    const sendPromise = chat.sendMessage({ message: [responsePart] });
    const response = await Promise.race([sendPromise, timeoutPromise]);

    let toolCall = null;
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      toolCall = normalizeToolCall(call.name, call.args);
    } else if (response.text) {
      // Send quick reminder if conversational text was returned
      try {
        const reminder = await chat.sendMessage({
          message: 'Observation received. Please select your next tool call (look, move, collect, or unlock).'
        });
        if (reminder.functionCalls && reminder.functionCalls.length > 0) {
          const call = reminder.functionCalls[0];
          toolCall = normalizeToolCall(call.name, call.args);
        }
      } catch (_) {}
    }

    if (!toolCall) {
      toolCall = { name: 'look', args: {} };
    }

    return {
      provider: this.name,
      model: activeModel || this.getModelName(),
      toolCall,
      thought: response.text ? response.text.trim() : null,
      chat
    };
  }

  /**
   * Reconstructs a Gemini chat session from authoritative mission history
   */
  async reconstructChat({ startPos = { row: 7, col: 1 }, authoritativeHistory = [], preferredModel = null }) {
    const initialPrompt = `Mission started. You are positioned at row ${startPos.row}, column ${startPos.col} in an unknown 9×9 maze. Your mission: Find the key, unlock the locked door, and reach the exit. What tool do you want to call first?`;

    const history = [
      {
        role: 'user',
        parts: [{ text: initialPrompt }]
      }
    ];

    for (let i = 0; i < authoritativeHistory.length; i++) {
      const turn = authoritativeHistory[i];
      history.push({
        role: 'model',
        parts: [{ functionCall: { name: turn.action.name, args: turn.action.args || {} } }]
      });
      history.push({
        role: 'user',
        parts: [{ functionResponse: { name: turn.action.name, response: turn.result || { success: true } } }]
      });
    }

    const client = this.getClient();
    const candidates = this.getCandidateModels(preferredModel);
    let lastError = null;

    for (let i = 0; i < candidates.length; i++) {
      const activeModel = candidates[i];
      try {
        const chat = client.chats.create({
          model: activeModel,
          history: history.length > 0 ? history : undefined,
          config: {
            systemInstruction: AGENT_SYSTEM_INSTRUCTION,
            tools: GEMINI_TOOLS_CONFIG
          }
        });

        return { chat, model: activeModel };
      } catch (error) {
        lastError = error;
        const classification = classifyProviderError(error);
        if (classification.isFallbackable && i < candidates.length - 1) {
          continue;
        }
        break;
      }
    }

    throw lastError;
  }
}
