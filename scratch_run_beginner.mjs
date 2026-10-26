import dotenv from 'dotenv';
dotenv.config();

import { createInitialState, dispatchToolCall, MISSION_STATUS } from './src/game/engine.js';
import { startAgentSession, stepAgentSession, stopAgentSession } from './server/providers/manager.js';

async function runBeginnerMission() {
  console.log('--- Starting Beginner Maze Mission with Local AI (qwen3:0.6b) ---');
  let gameState = createInitialState('beginner');
  const latencies = [];
  let invalidMoves = 0;
  let formatErrors = 0;
  const startTime = Date.now();

  const startRes = await startAgentSession({
    startPos: gameState.robot,
    forceProvider: 'ollama'
  });

  if (!startRes.data.success) {
    console.error('Failed to start session:', startRes.data.error);
    return;
  }

  const sessionId = startRes.data.sessionId;
  console.log(`Session initialized. Provider: ${startRes.data.provider}, Model: ${startRes.data.model}`);
  
  let currentToolCall = startRes.data.toolCall;
  let step = 0;
  const maxSteps = 30; // limit test run

  while (step < maxSteps && gameState.status !== MISSION_STATUS.COMPLETED && gameState.status !== MISSION_STATUS.FAILED) {
    step++;
    const stepStart = Date.now();

    // Execute tool in the game engine
    const toolName = currentToolCall.name;
    const toolArgs = currentToolCall.args || {};
    
    // Dispatch tool to the real engine
    gameState = dispatchToolCall(gameState, toolName, toolArgs);
    const engineResult = gameState.lastToolResult;

    const actionSuccess = engineResult.success;
    if (!actionSuccess && toolName === 'move') {
      invalidMoves++;
    }

    console.log(`[Step ${step}] Tool: ${toolName}(${JSON.stringify(toolArgs)}) -> ${actionSuccess ? 'OK' : 'BLOCKED'}: ${engineResult.message || ''}`);
    console.log(`          Robot: (${gameState.robot.row}, ${gameState.robot.col}) HasKey: ${gameState.hasKey} Status: ${gameState.status}`);

    if (gameState.status === MISSION_STATUS.COMPLETED) {
      console.log('🎉 MISSION ACCOMPLISHED!');
      break;
    }

    // Call next step
    const nextRes = await stepAgentSession({
      sessionId,
      toolResponse: {
        name: toolName,
        response: engineResult
      }
    });

    const stepDuration = Date.now() - stepStart;
    latencies.push(stepDuration);

    if (!nextRes.data.success) {
      console.error('Step failed:', nextRes.data.error);
      formatErrors++;
      break;
    }

    currentToolCall = nextRes.data.toolCall;
    if (!currentToolCall || !currentToolCall.name) {
      formatErrors++;
      console.error('Malformed tool call returned:', nextRes.data);
      break;
    }
  }

  const totalTime = Date.now() - startTime;
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

  stopAgentSession(sessionId);

  console.log('\n================ EXPERIMENT SUMMARY ================');
  console.log(`Outcome: ${gameState.status}`);
  console.log(`Total tool calls executed: ${step}`);
  console.log(`Robot final position: (${gameState.robot.row}, ${gameState.robot.col})`);
  console.log(`Key collected: ${gameState.hasKey}`);
  console.log(`Door unlocked: ${gameState.doorUnlocked}`);
  console.log(`Average step latency: ${avgLatency} ms`);
  console.log(`Min step latency: ${Math.min(...latencies)} ms`);
  console.log(`Max step latency: ${Math.max(...latencies)} ms`);
  console.log(`Total mission duration: ${(totalTime / 1000).toFixed(2)} s`);
  console.log(`Blocked / Invalid moves: ${invalidMoves}`);
  console.log(`JSON format errors: ${formatErrors}`);
  console.log('====================================================\n');
}

runBeginnerMission().catch(console.error);

