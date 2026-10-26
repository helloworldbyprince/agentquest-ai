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
  const [activeProvider, setActiveProvider] = useState('groq');
  const [activeModel, setActiveModel] = useState('openai/gpt-oss-20b');
  const [maxActionBudget, setMaxActionBudget] = useState(100);

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

    const providerName = sessionData.provider || 'groq';
    const modelName = sessionData.model || 'openai/gpt-oss-20b';
    setActiveProvider(providerName);
    setActiveModel(modelName);

    // Friendly Activity Log: PROVIDER SELECTED
    const providerLabel = providerName === 'groq'
      ? `Groq — ${modelName.includes('/') ? modelName.split('/')[1].toUpperCase() : modelName}`
      : `Gemini — ${modelName}`;

    currentState = {
      ...currentState,
      logs: [
        ...currentState.logs,
        createLogEntry(LOG_TYPES.PROVIDER_SELECTED, providerLabel, {
          status: 'info',
          provider: providerName
        })
      ]
    };

    // If initial fallback occurred from Groq to Gemini
    if (sessionData.fallbackFrom) {
      currentState = {
        ...currentState,
        logs: [
          ...currentState.logs,
          createLogEntry(
            LOG_TYPES.PROVIDER_SWITCHED,
            `${sessionData.fallbackFrom} → ${providerLabel}`,
            { status: 'warning', provider: providerName }
          ),
          createLogEntry(
            LOG_TYPES.MISSION_CONTINUED,
            'Previous maze progress preserved.',
            { status: 'success' }
          )
        ]
      };
    }
    setGameState(currentState);

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
            createLogEntry(LOG_TYPES.MISSION_FAILED, 'AI model did not return an actionable tool call.', {
              status: 'failure'
            })
          ]
        }));
        break;
      }

      // Log AI DECISION
      const argSummary = nextToolCall.args ? JSON.stringify(nextToolCall.args) : '';
      const decisionLog = createLogEntry(
        LOG_TYPES.AI_RESPONSE,
        `${providerName === 'groq' ? 'Groq' : 'Gemini'} decided: ${nextToolCall.name}(${argSummary})`,
        { tool: nextToolCall.name, status: 'info', payload: nextToolCall, provider: providerName }
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
        status: MISSION_STATUS.EXPLORING,
        logs: [...currentState.logs, decisionLog]
      };

      currentState = dispatchToolCall(currentState, toolName, ...toolArgs);
      
      // If move failed, show replanning status
      if (!currentState.lastToolResult?.success) {
        currentState.status = MISSION_STATUS.REPLANNING;
      }
      setGameState(currentState);

      // Check Mission Completion
      if (currentState.status === MISSION_STATUS.COMPLETED) {
        break;
      }

      // Check Action Budget (default 100 game actions, safely pauses with resume option)
      let currentBudget = maxActionBudget;
      if (currentState.stats.toolCalls >= currentBudget) {
        const limitLog = createLogEntry(
          LOG_TYPES.LIMIT_REACHED,
          `Action budget reached (${currentBudget} actions). Mission safely paused. Click Resume Agent to continue (+50 actions).`,
          { status: 'warning' }
        );
        currentState = {
          ...currentState,
          status: MISSION_STATUS.LIMIT_REACHED,
          logs: [...currentState.logs, limitLog]
        };
        setGameState(currentState);
        controlRef.current.isPaused = true;
        setIsAgentBusy(false);

        // Wait for user to resume
        await checkPause();
        if (controlRef.current.isStopped) break;
        setIsAgentBusy(true);

        // Expand budget by +50 actions
        currentBudget += 50;
        setMaxActionBudget(currentBudget);

        currentState = {
          ...currentState,
          status: MISSION_STATUS.RUNNING,
          logs: [
            ...currentState.logs,
            createLogEntry(
              LOG_TYPES.MISSION_CONTINUED,
              `Action budget expanded to ${currentBudget} actions. Exploration resuming.`,
              { status: 'info' }
            )
          ]
        };
        setGameState(currentState);
      }

      // Visual Playback Delay between steps
      await sleep(speed);
      await checkPause();
      if (controlRef.current.isStopped) break;

      // Update status to waiting for AI
      setGameState((prev) => ({
        ...prev,
        status: MISSION_STATUS.WAITING_AI
      }));

      // Send actual engine tool result back to active AI Provider
      let stepCompleted = false;
      while (!stepCompleted && !controlRef.current.isStopped) {
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
            // Check if all providers are temporarily unavailable
            if (stepData.allProvidersUnavailable) {
              currentState = {
                ...currentState,
                status: MISSION_STATUS.PAUSED,
                logs: [
                  ...currentState.logs,
                  createLogEntry(
                    LOG_TYPES.RATE_LIMITED,
                    'All AI providers are temporarily unavailable. Your mission is safely paused.',
                    { status: 'warning' }
                  )
                ]
              };
              setGameState(currentState);
              controlRef.current.isPaused = true;
              setIsAgentBusy(false);

              // Wait until user clicks "Resume Agent"
              await checkPause();
              if (controlRef.current.isStopped) break;
              setIsAgentBusy(true);
              continue;
            }
            throw new Error(stepData.error || 'Agent step returned an error.');
          }

          // Check if mid-session provider fallback occurred
          if (stepData.fallbackOccurred) {
            const newProvider = stepData.provider || 'gemini';
            const newModel = stepData.model || 'gemini-2.5-flash-lite';
            setActiveProvider(newProvider);
            setActiveModel(newModel);

            const newLabel = newProvider === 'groq' ? `Groq — ${newModel}` : `Gemini — ${newModel}`;
            currentState = {
              ...currentState,
              logs: [
                ...currentState.logs,
                createLogEntry(
                  LOG_TYPES.RATE_LIMITED,
                  `${stepData.previousProvider || 'Primary provider'} request quota reached.`,
                  { status: 'warning' }
                ),
                createLogEntry(
                  LOG_TYPES.PROVIDER_SWITCHED,
                  `${stepData.previousProvider || 'Groq'} → ${newLabel}`,
                  { status: 'warning' }
                ),
                createLogEntry(
                  LOG_TYPES.MISSION_CONTINUED,
                  'Previous maze progress preserved.',
                  { status: 'success' }
                )
              ]
            };
            setGameState(currentState);
          }

          // Check if repeated unproductive action was warned
          if (stepData.repeatedBlockedCount > 0) {
            currentState = {
              ...currentState,
              logs: [
                ...currentState.logs,
                createLogEntry(
                  LOG_TYPES.REPEATED_ACTION_WARNED,
                  `Loop Warning: Attempting "${toolName}" was blocked again. Choosing alternative route.`,
                  { status: 'warning' }
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
          stepCompleted = true;
        } catch (err) {
          if (controlRef.current.isStopped) break;
          const errMsg = err.message || 'Transient error communicating with AI agent.';
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
    activeProvider,
    activeModel,
    maxActionBudget,
    setMaxActionBudget,
    startAgent,
    pauseAgent,
    resumeAgent,
    stopAgent
  };
}

