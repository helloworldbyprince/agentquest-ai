import { describe, it, expect, vi, beforeEach } from 'vitest';
import dotenv from 'dotenv';
dotenv.config();

import {
  groqProvider,
  geminiProvider,
  startAgentSession,
  stepAgentSession,
  stopAgentSession,
  getSession
} from '../server/providers/manager.js';
import {
  classifyProviderError,
  normalizeToolCall,
  AGENT_SYSTEM_INSTRUCTION
} from '../server/providers/base.js';
import { GroqProvider } from '../server/providers/groq.js';
import { GeminiProvider } from '../server/providers/gemini.js';

describe('Multi-Provider AI Architecture & Fallback', () => {
  it('correctly classifies provider errors as fallbackable vs auth errors', () => {
    // 429 Rate limit / Quota -> Fallbackable
    const err429 = classifyProviderError({ status: 429, message: 'Rate limit reached' });
    expect(err429.isFallbackable).toBe(true);
    expect(err429.isAuthError).toBe(false);

    // 503 Service unavailable -> Fallbackable
    const err503 = classifyProviderError({ status: 503, message: 'Service Overloaded' });
    expect(err503.isFallbackable).toBe(true);
    expect(err503.isAuthError).toBe(false);

    // 401 Bad API Key -> NOT Fallbackable (Fatal Auth Error)
    const err401 = classifyProviderError({ status: 401, message: 'invalid_api_key' });
    expect(err401.isFallbackable).toBe(false);
    expect(err401.isAuthError).toBe(true);
  });

  it('normalizes tool calls with JSON strings and object arguments', () => {
    const fromJson = normalizeToolCall('move', '{"direction":"north"}');
    expect(fromJson.name).toBe('move');
    expect(fromJson.args).toEqual({ direction: 'north' });

    const fromObj = normalizeToolCall('look', {});
    expect(fromObj.name).toBe('look');
    expect(fromObj.args).toEqual({});
  });

  it('reconstructs Groq conversation history faithfully without mutating mission state', () => {
    const groq = new GroqProvider();
    const history = [
      {
        turn: 1,
        action: { name: 'look', args: {} },
        result: { surroundings: { north: 'wall', south: 'empty' } }
      },
      {
        turn: 2,
        action: { name: 'move', args: { direction: 'south' } },
        result: { success: true }
      }
    ];

    const { messages, lastCallId } = groq.reconstructMessages({
      startPos: { row: 7, col: 1 },
      authoritativeHistory: history
    });

    expect(messages.length).toBe(6); // system, user, assistant(look), tool(look), assistant(move), tool(move)
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[2].role).toBe('assistant');
    expect(messages[2].tool_calls[0].function.name).toBe('look');
    expect(messages[3].role).toBe('tool');
    expect(messages[4].tool_calls[0].function.name).toBe('move');
    expect(messages[5].role).toBe('tool');
    expect(lastCallId).toBeDefined();
  });

  it('automatically falls back from Groq to Gemini on 429 Rate Limit during session start', async () => {
    const origGroqStart = groqProvider.startSession;
    const origGeminiStart = geminiProvider.startSession;

    // Simulate Groq 429
    groqProvider.startSession = vi.fn().mockRejectedValue({
      status: 429,
      message: 'Groq TPM/RPM limit exceeded'
    });

    // Mock Gemini startSession
    geminiProvider.startSession = vi.fn().mockResolvedValue({
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite',
      toolCall: { name: 'look', args: {} },
      thought: 'Starting on Gemini fallback',
      chat: { id: 'mock-chat' }
    });

    try {
      const res = await startAgentSession({ startPos: { row: 7, col: 1 } });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.fallbackFrom).toBe('Groq');
      expect(res.data.provider).toBe('gemini');
      expect(res.data.toolCall.name).toBe('look');
    } finally {
      groqProvider.startSession = origGroqStart;
      geminiProvider.startSession = origGeminiStart;
    }
  });

  it('automatically falls back from Groq to Gemini on 503 Service Unavailable during session step', async () => {
    // Start session on Groq
    const startRes = await startAgentSession({ startPos: { row: 7, col: 1 } });
    const sessionId = startRes.data.sessionId;

    const origStep = groqProvider.stepSession;
    const origGeminiReconstruct = geminiProvider.reconstructChat;
    const origGeminiStep = geminiProvider.stepSession;

    // Mock 503 outage on step
    groqProvider.stepSession = vi.fn().mockRejectedValue({
      status: 503,
      message: 'Groq Service Unavailable'
    });

    geminiProvider.reconstructChat = vi.fn().mockResolvedValue({
      chat: { id: 'mock-gemini-chat' },
      model: 'gemini-2.5-flash-lite'
    });

    geminiProvider.stepSession = vi.fn().mockResolvedValue({
      toolCall: { name: 'move', args: { direction: 'east' } },
      thought: 'Continuing after Groq failover',
      chat: { id: 'mock-gemini-chat' }
    });

    try {
      const stepRes = await stepAgentSession({
        sessionId,
        toolResponse: {
          name: 'look',
          response: { surroundings: { north: 'wall', east: 'empty' } }
        }
      });

      expect(stepRes.status).toBe(200);
      expect(stepRes.data.success).toBe(true);
      expect(stepRes.data.fallbackOccurred).toBe(true);
      expect(stepRes.data.previousProvider).toBe('Groq');
      expect(stepRes.data.provider).toBe('gemini');
      expect(stepRes.data.toolCall.name).toBe('move');
      expect(stepRes.data.toolCall.args.direction).toBe('east');

      // Verify sticky fallback: next step stays on Gemini without switching back to Groq
      expect(getSession(sessionId).activeProvider).toBe('gemini');
    } finally {
      groqProvider.stepSession = origStep;
      geminiProvider.reconstructChat = origGeminiReconstruct;
      geminiProvider.stepSession = origGeminiStep;
      stopAgentSession(sessionId);
    }
  });

  it('safely pauses mission with friendly notification when all providers are unavailable', async () => {
    const startRes = await startAgentSession({ startPos: { row: 7, col: 1 } });
    const sessionId = startRes.data.sessionId;

    const origGroqStep = groqProvider.stepSession;
    const origGeminiReconstruct = geminiProvider.reconstructChat;

    // Both fail
    groqProvider.stepSession = vi.fn().mockRejectedValue({ status: 503, message: 'Groq down' });
    geminiProvider.reconstructChat = vi.fn().mockRejectedValue({ status: 503, message: 'Gemini down' });

    try {
      const stepRes = await stepAgentSession({
        sessionId,
        toolResponse: { name: 'look', response: { status: 'ok' } }
      });

      expect(stepRes.status).toBe(503);
      expect(stepRes.data.allProvidersUnavailable).toBe(true);
      expect(stepRes.data.error).toContain('All AI providers are temporarily unavailable. Your mission is safely paused.');
    } finally {
      groqProvider.stepSession = origGroqStep;
      geminiProvider.reconstructChat = origGeminiReconstruct;
      stopAgentSession(sessionId);
    }
  });

  it('performs live multi-turn function calling with genuine Groq API', async () => {
    if (!groqProvider.isConfigured()) return;

    // 1. Live start
    const startRes = await startAgentSession({ startPos: { row: 7, col: 1 } });
    expect(startRes.status).toBe(200);
    expect(startRes.data.success).toBe(true);
    expect(startRes.data.provider).toBe('groq');
    expect(['look', 'move', 'collect', 'unlock']).toContain(startRes.data.toolCall.name);

    // 2. Live step
    const stepRes = await stepAgentSession({
      sessionId: startRes.data.sessionId,
      toolResponse: {
        name: startRes.data.toolCall.name,
        response: {
          current: { type: 'empty' },
          surroundings: { north: 'wall', south: 'wall', east: 'empty', west: 'wall' }
        }
      }
    });

    expect(stepRes.status).toBe(200);
    expect(stepRes.data.success).toBe(true);
    expect(stepRes.data.provider).toBe('groq');
    expect(['look', 'move', 'collect', 'unlock']).toContain(stepRes.data.toolCall.name);

    stopAgentSession(startRes.data.sessionId);
  }, 20000);
});

