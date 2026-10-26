import http from 'http';
import { normalizeToolCall } from './base.js';

export const OLLAMA_SYSTEM_INSTRUCTION = `You are AgentQuest, an intelligent exploration robot in an unknown 9×9 maze.
Goal: Find the golden key, unlock the door, and reach the exit.
Available tools:
- move(direction): "north", "south", "east", "west"
- look(): inspect immediate surroundings
- collect(): pick up key when on the key tile
- unlock(): unlock door when adjacent and holding key

Strategy:
- Do NOT call look() repeatedly. If surroundings are already known, MOVE towards an open direction.
- Avoid moving into walls.
- Explore open corridors to locate the key and door.

Reply with valid JSON only. Never output commentary.
Format:
{"tool": "move", "arguments": {"direction": "east"}}
or
{"tool": "look", "arguments": {}}
or
{"tool": "collect", "arguments": {}}
or
{"tool": "unlock", "arguments": {}}`;

export class OllamaProvider {
  constructor({
    host = process.env.OLLAMA_HOST || '127.0.0.1',
    port = process.env.OLLAMA_PORT || 11434,
    modelName = process.env.OLLAMA_MODEL || 'qwen3:0.6b'
  } = {}) {
    this.name = 'ollama';
    this.displayName = 'Local AI — Qwen3 0.6B';
    this.host = host;
    this.port = Number(port);
    this.modelName = modelName;
    this.isInferencing = false;
  }

  getModelName() {
    return process.env.OLLAMA_MODEL || this.modelName || 'qwen3:0.6b';
  }

  /**
   * Helper to make HTTP request to Ollama daemon
   */
  async request(path, payload = null, { method = 'POST', timeoutMs = 8000 } = {}) {
    return new Promise((resolve, reject) => {
      const dataStr = payload ? JSON.stringify(payload) : null;
      const options = {
        hostname: this.host,
        port: this.port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(dataStr ? { 'Content-Length': Buffer.byteLength(dataStr) } : {})
        },
        timeout: timeoutMs
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const parsed = body ? JSON.parse(body) : {};
            resolve({ status: res.statusCode, data: parsed });
          } catch (err) {
            resolve({ status: res.statusCode, data: { raw: body } });
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('REQUEST_TIMEOUT'));
      });

      req.on('error', (err) => reject(err));

      if (dataStr) req.write(dataStr);
      req.end();
    });
  }

  /**
   * Fast check whether Ollama is reachable and has the model
   */
  async isAvailable() {
    try {
      const res = await this.request('/api/tags', null, { method: 'GET', timeoutMs: 1500 });
      if (res.status === 200 && Array.isArray(res.data?.models)) {
        const target = this.getModelName();
        return res.data.models.some((m) => m.name === target || m.name.startsWith(target.split(':')[0]));
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  /**
   * Tests connection and minimal inference
   */
  async testConnection({ timeoutMs = 8000 } = {}) {
    try {
      const tagsRes = await this.request('/api/tags', null, { method: 'GET', timeoutMs: 2000 });
      if (tagsRes.status !== 200) {
        return {
          status: 503,
          data: {
            success: false,
            provider: this.name,
            error: 'Ollama is not running. Please start Ollama with "ollama serve".'
          }
        };
      }

      const model = this.getModelName();
      const hasModel = tagsRes.data.models?.some((m) => m.name === model || m.name.startsWith(model.split(':')[0]));

      if (!hasModel) {
        return {
          status: 404,
          data: {
            success: false,
            provider: this.name,
            error: `Model "${model}" not found in Ollama. Run "ollama pull ${model}" to install.`
          }
        };
      }

      // Quick test inference with thinking bypass
      const testChat = await this.request(
        '/api/chat',
        {
          model,
          messages: [
            { role: 'user', content: 'Say hello in JSON: {"status": "ok"}' },
            { role: 'assistant', content: '</think>' }
          ],
          format: 'json',
          stream: false,
          options: {
            num_ctx: 1024,
            num_predict: 40,
            temperature: 0.1
          }
        },
        { timeoutMs }
      );

      return {
        status: 200,
        data: {
          success: true,
          provider: this.name,
          model,
          displayName: this.displayName,
          message: 'Local Ollama AI connection successful.'
        }
      };
    } catch (err) {
      return {
        status: 503,
        data: {
          success: false,
          provider: this.name,
          error: `Ollama connection error: ${err.message}`
        }
      };
    }
  }

  /**
   * Parses JSON tool call from raw model content
   */
  parseToolCall(content) {
    if (!content) return { name: 'look', args: {} };

    // Clean markdown code blocks
    let cleaned = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

    try {
      const parsed = JSON.parse(cleaned);
      const toolName = (parsed.tool || parsed.name || 'look').toLowerCase().trim();
      const cleanTool = ['look', 'move', 'collect', 'unlock'].includes(toolName) ? toolName : 'look';
      
      let args = {};
      if (parsed.arguments && typeof parsed.arguments === 'object') {
        args = parsed.arguments;
      } else if (parsed.direction) {
        args = { direction: parsed.direction };
      }

      return normalizeToolCall(cleanTool, args);
    } catch (_) {
      // Regex fallback if JSON had minor syntax irregularity
      const toolMatch = cleaned.match(/"tool":\s*"([a-zA-Z]+)"/);
      const dirMatch = cleaned.match(/"direction":\s*"([a-zA-Z]+)"/);
      const toolName = toolMatch ? toolMatch[1].toLowerCase() : 'look';
      const cleanTool = ['look', 'move', 'collect', 'unlock'].includes(toolName) ? toolName : 'look';
      const args = dirMatch ? { direction: dirMatch[1].toLowerCase() } : {};
      return normalizeToolCall(cleanTool, args);
    }
  }

  /**
   * Starts a new session on Local Ollama
   */
  async startSession({ startPos = { row: 7, col: 1 }, timeoutMs = 12000 } = {}) {
    const model = this.getModelName();
    const initialPrompt = `Mission started. You are positioned at row ${startPos.row}, column ${startPos.col} in an unknown 9×9 maze. Goal: find the key, unlock the door, and reach the exit. What tool do you want to call first?`;

    const messages = [
      { role: 'system', content: OLLAMA_SYSTEM_INSTRUCTION },
      { role: 'user', content: initialPrompt },
      { role: 'assistant', content: '</think>' }
    ];

    const res = await this.request(
      '/api/chat',
      {
        model,
        messages,
        format: 'json',
        stream: false,
        options: {
          num_ctx: 1024,
          num_predict: 60,
          temperature: 0.1
        }
      },
      { timeoutMs }
    );

    if (res.status !== 200 || !res.data) {
      throw new Error(res.data?.error || `Ollama API returned status ${res.status}`);
    }

    const rawContent = res.data.message?.content || '';
    const toolCall = this.parseToolCall(rawContent);

    // Bounded messages history for memory efficiency
    const sessionMessages = [
      { role: 'system', content: OLLAMA_SYSTEM_INSTRUCTION },
      { role: 'user', content: initialPrompt },
      { role: 'assistant', content: JSON.stringify({ tool: toolCall.name, arguments: toolCall.args }) }
    ];

    return {
      provider: this.name,
      model,
      toolCall,
      thought: null,
      messages: sessionMessages
    };
  }

  /**
   * Advances the Local Ollama session with the tool response
   */
  async stepSession({ messages = [], toolResponse, timeoutMs = 12000 } = {}) {
    const model = this.getModelName();
    const rawResp = toolResponse.response || {};
    const obs = rawResp.observation || {};

    // Construct ultra-compact factual observation text to save memory & tokens
    let obsSummary = `Tool "${toolResponse.name}" result: ${rawResp.message || (rawResp.success ? 'Success' : 'Failed')}.`;
    if (obs.currentTile) obsSummary += ` Current: ${obs.currentTile}.`;
    if (obs.position) obsSummary += ` At (${obs.position.row}, ${obs.position.col}).`;
    if (obs.surroundings) {
      const dirs = Object.entries(obs.surroundings)
        .map(([d, info]) => `${d}: ${info.traversable ? 'open' : 'blocked'}`)
        .join(', ');
      obsSummary += ` Surroundings: ${dirs}.`;
    }
    if (rawResp.warning) obsSummary += ` ${rawResp.warning}`;
    if (rawResp.guidance) obsSummary += ` ${rawResp.guidance}`;

    obsSummary += ` Select your next tool (look, move, collect, unlock) in JSON format.`;

    // Keep memory footprint bounded: retain system prompt + last 4 turns
    const history = messages.length > 6
      ? [messages[0], ...messages.slice(-4)]
      : [...messages];

    history.push({ role: 'user', content: obsSummary });
    
    // Bypass Qwen3 thinking tokens to preserve low latency on M2
    const inferenceMessages = [...history, { role: 'assistant', content: '</think>' }];

    const res = await this.request(
      '/api/chat',
      {
        model,
        messages: inferenceMessages,
        format: 'json',
        stream: false,
        options: {
          num_ctx: 1024,
          num_predict: 60,
          temperature: 0.1
        }
      },
      { timeoutMs }
    );

    if (res.status !== 200 || !res.data) {
      throw new Error(res.data?.error || `Ollama API returned status ${res.status}`);
    }

    const rawContent = res.data.message?.content || '';
    const toolCall = this.parseToolCall(rawContent);

    history.push({
      role: 'assistant',
      content: JSON.stringify({ tool: toolCall.name, arguments: toolCall.args })
    });

    return {
      provider: this.name,
      model,
      toolCall,
      thought: null,
      messages: history
    };
  }
}

export const defaultOllamaProvider = new OllamaProvider();
