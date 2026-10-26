import { Groq } from 'groq-sdk';
import {
  AGENT_SYSTEM_INSTRUCTION,
  GROQ_TOOLS,
  classifyProviderError,
  normalizeToolCall
} from './base.js';

function extractFailedGeneration(apiError) {
  if (apiError?.error?.failed_generation) {
    return apiError.error.failed_generation;
  }
  if (typeof apiError?.message === 'string') {
    const rawMsg = apiError.message;
    const jsonIdx = rawMsg.indexOf('{');
    if (jsonIdx !== -1) {
      try {
        const parsed = JSON.parse(rawMsg.slice(jsonIdx));
        if (parsed?.error?.failed_generation) {
          return parsed.error.failed_generation;
        }
      } catch (_) {
        const match = rawMsg.match(/"failed_generation":\s*"(\{[\s\S]*?\})"/);
        if (match) return match[1].replace(/\\"/g, '"');
      }
    }
  }
  return null;
}

export class GroqProvider {
  constructor({
    apiKey = null,
    modelName = null
  } = {}) {
    this.name = 'groq';
    this.displayName = 'Groq — GPT-OSS 20B';
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.client = null;
  }

  getApiKey() {
    return this.apiKey || process.env.GROQ_API_KEY;
  }

  getModelName() {
    return this.modelName || process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
  }

  isConfigured() {
    const key = this.getApiKey();
    return Boolean(key && key.trim() !== '' && key !== 'your_groq_api_key_here');
  }

  getClient() {
    const key = this.getApiKey();
    if (!key || key === 'your_groq_api_key_here') return null;
    if (!this.client) {
      this.client = new Groq({ apiKey: key });
    }
    return this.client;
  }

  /**
   * Performs connection test against Groq API
   */
  async testConnection({ timeoutMs = 12000 } = {}) {
    if (!this.isConfigured()) {
      return {
        status: 400,
        data: {
          success: false,
          provider: this.name,
          error: 'GROQ_API_KEY is not configured on the server. Please check your .env file.'
        }
      };
    }

    const client = this.getClient();
    const model = this.getModelName();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), timeoutMs)
    );

    try {
      const completionPromise = client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: AgentQuest AI connection successful.' }],
        max_tokens: 50
      });

      const response = await Promise.race([completionPromise, timeoutPromise]);
      const content = response.choices?.[0]?.message?.content?.trim() || 'AgentQuest AI connection successful.';

      return {
        status: 200,
        data: {
          success: true,
          provider: this.name,
          model,
          message: content
        }
      };
    } catch (error) {
      const classification = classifyProviderError(error);
      return {
        status: classification.status,
        data: {
          success: false,
          provider: this.name,
          model,
          error: classification.message
        }
      };
    }
  }

  /**
   * Starts a new session on Groq
   */
  async startSession({ startPos = { row: 7, col: 1 }, timeoutMs = 15000 } = {}) {
    if (!this.isConfigured()) {
      throw new Error('GROQ_API_KEY is not configured.');
    }

    const client = this.getClient();
    const model = this.getModelName();
    const initialPrompt = `Mission started. You are positioned at row ${startPos.row}, column ${startPos.col} in an unknown 9×9 maze. Your mission: Find the key, unlock the locked door, and reach the exit. What tool do you want to call first?`;

    const messages = [
      { role: 'system', content: AGENT_SYSTEM_INSTRUCTION },
      { role: 'user', content: initialPrompt }
    ];

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), timeoutMs)
    );

    const completionPromise = client.chat.completions.create({
      model,
      messages,
      tools: GROQ_TOOLS,
      tool_choice: 'auto'
    });

    let completion = null;
    try {
      completion = await Promise.race([completionPromise, timeoutPromise]);
    } catch (apiError) {
      // Check if error contains failed_generation that we can parse and recover
      const rawFailedGen = extractFailedGeneration(apiError);
      if (rawFailedGen) {
        try {
          const parsed = typeof rawFailedGen === 'string' ? JSON.parse(rawFailedGen) : rawFailedGen;
          const rawName = String(parsed.name || '');
          const cleanName = rawName.split(/[^a-zA-Z]/)[0].toLowerCase();
          if (['look', 'move', 'collect', 'unlock'].includes(cleanName)) {
            const nextCallId = `call_${Date.now()}`;
            const recoveredToolCall = { name: cleanName, args: parsed.arguments || {} };
            messages.push({
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: nextCallId,
                  type: 'function',
                  function: {
                    name: cleanName,
                    arguments: JSON.stringify(recoveredToolCall.args)
                  }
                }
              ]
            });
            return {
              provider: this.name,
              model,
              toolCall: recoveredToolCall,
              thought: null,
              rawCallId: nextCallId,
              messages
            };
          }
        } catch (_) {}
      }
      throw apiError;
    }
    const choice = completion.choices?.[0]?.message;

    let toolCall = null;
    let rawCallId = `call_${Date.now()}`;

    if (choice?.tool_calls && choice.tool_calls.length > 0) {
      const firstCall = choice.tool_calls[0];
      rawCallId = firstCall.id;
      toolCall = normalizeToolCall(firstCall.function?.name, firstCall.function?.arguments);
      messages.push(choice);
    } else {
      toolCall = { name: 'look', args: {} };
      const syntheticAssistant = {
        role: 'assistant',
        content: choice?.content || null,
        tool_calls: [
          {
            id: rawCallId,
            type: 'function',
            function: { name: 'look', arguments: '{}' }
          }
        ]
      };
      messages.push(syntheticAssistant);
    }

    return {
      provider: this.name,
      model,
      toolCall,
      thought: choice?.content ? choice.content.trim() : null,
      rawCallId,
      messages
    };
  }

  /**
   * Advances the Groq session with a tool response
   */
  async stepSession({ messages, toolResponse, lastCallId, timeoutMs = 15000 } = {}) {
    if (!this.isConfigured()) {
      throw new Error('GROQ_API_KEY is not configured.');
    }

    const client = this.getClient();
    const model = this.getModelName();
    const callId = lastCallId || `call_${Date.now()}`;
    messages.push({
      role: 'tool',
      tool_call_id: callId,
      content: JSON.stringify(toolResponse.response || { status: 'completed' })
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), timeoutMs)
    );

    const completionPromise = client.chat.completions.create({
      model,
      messages,
      tools: GROQ_TOOLS,
      tool_choice: 'auto'
    });

    let completion = null;
    try {
      completion = await Promise.race([completionPromise, timeoutPromise]);
    } catch (apiError) {
      // Check if error contains failed_generation that we can parse and recover
      const rawFailedGen = extractFailedGeneration(apiError);
      if (rawFailedGen) {
        try {
          const parsed = typeof rawFailedGen === 'string' ? JSON.parse(rawFailedGen) : rawFailedGen;
          const rawName = String(parsed.name || '');
          const cleanName = rawName.split(/[^a-zA-Z]/)[0].toLowerCase();
          if (['look', 'move', 'collect', 'unlock'].includes(cleanName)) {
            const nextCallId = `call_${Date.now()}`;
            const recoveredToolCall = { name: cleanName, args: parsed.arguments || {} };
            messages.push({
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: nextCallId,
                  type: 'function',
                  function: {
                    name: cleanName,
                    arguments: JSON.stringify(recoveredToolCall.args)
                  }
                }
              ]
            });
            return {
              provider: this.name,
              model,
              toolCall: recoveredToolCall,
              thought: null,
              rawCallId: nextCallId,
              messages
            };
          }
        } catch (_) {}
      }
      throw apiError;
    }
    const choice = completion.choices?.[0]?.message;

    let toolCall = null;
    let nextCallId = `call_${Date.now()}`;

    if (choice?.tool_calls && choice.tool_calls.length > 0) {
      const firstCall = choice.tool_calls[0];
      nextCallId = firstCall.id;
      toolCall = normalizeToolCall(firstCall.function?.name, firstCall.function?.arguments);
      messages.push(choice);
    } else {
      messages.push(choice);
      messages.push({
        role: 'user',
        content: 'Observation received. Please call your next tool: look, move, collect, or unlock.'
      });

      const reminderCompletion = await client.chat.completions.create({
        model,
        messages,
        tools: GROQ_TOOLS,
        tool_choice: 'auto'
      });

      const reminderChoice = reminderCompletion.choices?.[0]?.message;
      if (reminderChoice?.tool_calls && reminderChoice.tool_calls.length > 0) {
        const firstCall = reminderChoice.tool_calls[0];
        nextCallId = firstCall.id;
        toolCall = normalizeToolCall(firstCall.function?.name, firstCall.function?.arguments);
        messages.push(reminderChoice);
      } else {
        toolCall = { name: 'look', args: {} };
      }
    }

    return {
      provider: this.name,
      model,
      toolCall,
      thought: choice?.content ? choice.content.trim() : null,
      rawCallId: nextCallId,
      messages
    };
  }

  /**
   * Reconstructs Groq conversation messages array from authoritative mission history
   */
  reconstructMessages({ startPos = { row: 7, col: 1 }, authoritativeHistory = [], pendingToolResponse = null }) {
    const initialPrompt = `Mission started. You are positioned at row ${startPos.row}, column ${startPos.col} in an unknown 9×9 maze. Your mission: Find the key, unlock the locked door, and reach the exit. What tool do you want to call first?`;

    const messages = [
      { role: 'system', content: AGENT_SYSTEM_INSTRUCTION },
      { role: 'user', content: initialPrompt }
    ];

    let lastCallId = null;

    for (let i = 0; i < authoritativeHistory.length; i++) {
      const turn = authoritativeHistory[i];
      const callId = `call_turn_${turn.turn}_${i}`;
      lastCallId = callId;

      messages.push({
        role: 'assistant',
        content: turn.thought || null,
        tool_calls: [
          {
            id: callId,
            type: 'function',
            function: {
              name: turn.action.name,
              arguments: JSON.stringify(turn.action.args || {})
            }
          }
        ]
      });

      messages.push({
        role: 'tool',
        tool_call_id: callId,
        content: JSON.stringify(turn.result || { success: true })
      });
    }

    // If there is an active pending action that was called but waiting for response
    if (pendingToolResponse && pendingToolResponse.name) {
      const callId = `call_pending_${Date.now()}`;
      lastCallId = callId;
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: callId,
            type: 'function',
            function: {
              name: pendingToolResponse.name,
              arguments: JSON.stringify(pendingToolResponse.args || {})
            }
          }
        ]
      });
    }

    return { messages, lastCallId };
  }
}
