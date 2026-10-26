import { useState, useRef, useCallback } from 'react';
import {
  dispatchToolCall,
  createLogEntry,
  createInitialState,
  LOG_TYPES,
  MISSION_STATUS
} from '../game/engine.js';
import { apiFetch, safeJson } from '../utils/api.js';

export const AGENT_SPEEDS = {
  slow: { id: 'slow', label: 'Slow (1.2s)', ms: 1200 },
  normal: { id: 'normal', label: 'Normal (0.7s)', ms: 700 },
  fast: { id: 'fast', label: 'Fast (0.25s)', ms: 250 }
};

export function useAgentRunner({
  gameState,
  setGameState,
  selectedPresetId
}) {
  const [speed, setSpeed] = useState(AGENT_SPEEDS.normal.ms);
  const [isAgentBusy, setIsAgentBusy] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  // Control refs for non-stale access inside async loop
  const controlRef = useRef({
    isPaused: false,
    isStopped: false,
    resumeResolver: null,
    sessionId: null
  });

  // Helper sleep
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Wait if paused
  const checkPause = async () => {
    if (controlRef.current.isPaused && !controlRef.current.isStopped) {
      await new Promise((resolve) => {
        controlRef.current.resumeResolver = resolve;
      });
      controlRef.current.resumeResolver = null;
    }
  };

  /**
   * Starts autonomous agent mission
   */
  const startAgent = useCallback(async () => {
    if (!gameState.validation.isValid) return;

    // Reset control ref
    controlRef.current = {
      isPaused: false,
      isStopped: false,
      resumeResolver: null,
      sessionId: null
    };

    setIsAgentBusy(true);

    // 1. Initialize clean state at starting position
    const freshState = {
      ...createInitialState(selectedPresetId, gameState.grid),
      status: MISSION_STATUS.RUNNING
    };

    // Add AGENT_STARTED log
    freshState.logs.push(
      createLogEntry(
        LOG_TYPES.AGENT_STARTED,
        'Agent Started — Goal: Find the key, unlock the door, escape.',
        { status: 'info', elapsedSeconds: 0 }
      )
    );

    setGameState(freshState);
    let currentState = freshState;

    // 2. Initialize Gemini session on the backend
    let sessionData = null;
    try {
      const response = await apiFetch('/api/agent/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startPos: { row: currentState.robot.row, col: currentState.robot.col }
        })
      });

      sessionData = await safeJson(response);

      if (!response.ok || !sessionData.success) {
        throw new Error(sessionData.error || 'Failed to start Gemini agent session.');
      }
    } catch (err) {
      const errorMsg = err.message || 'Could not communicate with backend agent service.';
      setGameState((prev) => ({
        ...prev,
        status: MISSION_STATUS.FAILED,
        logs: [
          ...prev.logs,
          createLogEntry(LOG_TYPES.MISSION_FAILED, `Agent Start Failed: ${errorMsg}`, {
            status: 'failure'
          })
        ]
      }));
      setIsAgentBusy(false);
      return;
    }

    const currentSessionId = sessionData.sessionId;
    controlRef.current.sessionId = currentSessionId;
    setSessionId(currentSessionId);

    // If backend automatically fell back to another model due to quota limits
    if (sessionData.fallbackFrom) {
      currentState = {
        ...currentState,
        logs: [
          ...currentState.logs,
          createLogEntry(
            LOG_TYPES.AGENT_ADAPTED,
            `Quota reached on ${sessionData.fallbackFrom}. Auto-switched to ${sessionData.model}.`,
            { status: 'info' }
          )
        ]
      };
      setGameState(currentState);
    }

    let nextToolCall = sessionData.toolCall;

    // 3. Autonomous Execution Loop
    while (!controlRef.current.isStopped) {
      // Check pause state
      await checkPause();
      if (controlRef.current.isStopped) break;

      if (!nextToolCall || !nextToolCall.name) {
        setGameState((prev) => ({
          ...prev,
          status: MISSION_STATUS.FAILED,
          logs: [
            ...prev.logs,
            createLogEntry(LOG_TYPES.MISSION_FAILED, 'Gemini did not return an actionable tool call.', {
              status: 'failure'
            })
          ]
        }));
        break;
      }

      // Log GEMINI_RESPONSE
      const argSummary = nextToolCall.args ? JSON.stringify(nextToolCall.args) : '';
      const geminiLog = createLogEntry(
        LOG_TYPES.GEMINI_RESPONSE,
        `Gemini decided: ${nextToolCall.name}(${argSummary})`,
        { tool: nextToolCall.name, status: 'info', payload: nextToolCall }
      );

      // Execute tool call on authoritative game engine
      const toolName = nextToolCall.name;
      const toolArgs = nextToolCall.args?.direction
        ? [nextToolCall.args.direction]
        : nextToolCall.args
        ? [nextToolCall.args]
        : [];

      currentState = {
        ...currentState,
        logs: [...currentState.logs, geminiLog]
      };

      currentState = dispatchToolCall(currentState, toolName, ...toolArgs);
      setGameState(currentState);

      // Check Mission Completion
      if (currentState.status === MISSION_STATUS.COMPLETED) {
        break;
      }

      // Check Safety Limit (80 tool calls)
      if (currentState.stats.toolCalls >= 80) {
        const limitLog = createLogEntry(
          LOG_TYPES.MISSION_FAILED,
          'Safety limit reached: 80 tool calls completed without escaping.',
          { status: 'failure' }
        );
        currentState = {
          ...currentState,
          status: MISSION_STATUS.FAILED,
          logs: [...currentState.logs, limitLog]
        };
        setGameState(currentState);
        break;
      }

      // Visual Playback Delay between steps
      await sleep(speed);
      await checkPause();
      if (controlRef.current.isStopped) break;

      // Send actual engine tool result back to Gemini
      try {
        const stepResponse = await apiFetch('/api/agent/session/step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: currentSessionId,
            toolResponse: {
              name: toolName,
              response: currentState.lastToolResult || { success: true }
            }
          })
        });

        const stepData = await safeJson(stepResponse);

        if (!stepResponse.ok || !stepData.success) {
          throw new Error(stepData.error || 'Agent step returned an error.');
        }

        // Check if mid-session model fallback occurred due to rate limits
        if (stepData.fallbackOccurred) {
          currentState = {
            ...currentState,
            logs: [
              ...currentState.logs,
              createLogEntry(
                LOG_TYPES.AGENT_ADAPTED,
                `Model limit reached. Session seamlessly migrated to ${stepData.model}.`,
                { status: 'info' }
              )
            ]
          };
          setGameState(currentState);
        }

        // Check if agent adapted after a blocked action
        if (!currentState.lastToolResult?.success && stepData.toolCall) {
          currentState = {
            ...currentState,
            logs: [
              ...currentState.logs,
              createLogEntry(
                LOG_TYPES.AGENT_ADAPTED,
                `Agent adapted after blocked ${toolName}: Choosing ${stepData.toolCall.name} next.`,
                { status: 'info' }
              )
            ]
          };
          setGameState(currentState);
        }

        nextToolCall = stepData.toolCall;
      } catch (err) {
        if (controlRef.current.isStopped) break;
        const errMsg = err.message || 'Transient error contacting Gemini.';
        currentState = {
          ...currentState,
          status: MISSION_STATUS.FAILED,
          logs: [
            ...currentState.logs,
            createLogEntry(LOG_TYPES.MISSION_FAILED, `Agent Step Error: ${errMsg}`, {
              status: 'failure'
            })
          ]
        };
        setGameState(currentState);
        break;
      }
    }

    setIsAgentBusy(false);
  }, [gameState.validation.isValid, gameState.grid, selectedPresetId, speed, setGameState]);

  /**
   * Pauses agent execution
   */
  const pauseAgent = useCallback(() => {
    controlRef.current.isPaused = true;
    setGameState((prev) => ({
      ...prev,
      status: MISSION_STATUS.PAUSED
    }));
  }, [setGameState]);

  /**
   * Resumes agent execution
   */
  const resumeAgent = useCallback(() => {
    controlRef.current.isPaused = false;
    if (controlRef.current.resumeResolver) {
      controlRef.current.resumeResolver();
    }
    setGameState((prev) => ({
      ...prev,
      status: MISSION_STATUS.RUNNING
    }));
  }, [setGameState]);

  /**
   * Stops agent execution cleanly
   */
  const stopAgent = useCallback(() => {
    controlRef.current.isStopped = true;
    controlRef.current.isPaused = false;
    if (controlRef.current.resumeResolver) {
      controlRef.current.resumeResolver();
    }

    const currentId = controlRef.current.sessionId;
    if (currentId) {
      apiFetch('/api/agent/session/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentId })
      }).catch(() => {});
    }

    setIsAgentBusy(false);
    setGameState((prev) => ({
      ...prev,
      status: MISSION_STATUS.READY
    }));
  }, [setGameState]);

  return {
    speed,
    setSpeed,
    isAgentBusy,
    sessionId,
    startAgent,
    pauseAgent,
    resumeAgent,
    stopAgent
  };
}

