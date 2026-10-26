import React, { useState, useEffect } from 'react';
import { Bot, RotateCcw, Sparkles, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { apiFetch, safeJson } from '../utils/api.js';

export function Header({
  gameMode = 'manual',
  onModeChange,
  onReset,
  isRunning,
  onAddLog
}) {
  const [aiStatus, setAiStatus] = useState('not_connected'); // 'not_connected' | 'connecting' | 'connected' | 'failed'
  const [testResult, setTestResult] = useState(null);

  // Auto-check connection on load
  useEffect(() => {
    let isMounted = true;
    apiFetch('/api/health')
      .then((res) => safeJson(res))
      .then((data) => {
        if (isMounted && data.status === 'ok') {
          // Backend is running, verify Gemini key status
          apiFetch('/api/gemini/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })
            .then((res) => safeJson(res))
            .then((geminiData) => {
              if (isMounted) {
                if (geminiData.success) {
                  setAiStatus('connected');
                } else {
                  setAiStatus('failed');
                }
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  const handleTestConnection = async () => {
    setAiStatus('connecting');
    setTestResult({
      loading: true,
      success: false,
      message: 'Connecting to Gemini API via Express backend...'
    });

    try {
      const response = await apiFetch('/api/gemini/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await safeJson(response);

      if (response.ok && data.success) {
        setAiStatus('connected');
        const providerName = data.provider === 'groq' ? 'Groq' : 'Gemini';
        const fallbackNote = data.fallbackFrom ? ` (Auto-fallback from ${data.fallbackFrom})` : '';
        setTestResult({
          loading: false,
          success: true,
          provider: data.provider,
          model: data.model,
          message: `${providerName} (${data.model}${fallbackNote}): "${data.message || 'Connection successful.'}"`
        });

        if (onAddLog) {
          onAddLog(
            'TOOL_RESULT',
            `AI Provider connected successfully [${providerName} — ${data.model}${fallbackNote}]: "${data.message}"`,
            { status: 'success', payload: data }
          );
        }
      } else {
        setAiStatus('failed');
        setTestResult({
          loading: false,
          success: false,
          model: data.model,
          message: data.error || 'Failed to connect to Gemini API.'
        });

        if (onAddLog) {
          onAddLog(
            'ACTION_FAILED',
            `Gemini API connection test failed: ${data.error || 'Unknown error'}`,
            { status: 'failure', payload: data }
          );
        }
      }
    } catch (err) {
      setAiStatus('failed');
      const errorMsg = 'Could not reach backend server on /api/gemini/test. Ensure the backend is running (`npm run server`).';
      setTestResult({
        loading: false,
        success: false,
        message: errorMsg
      });

      if (onAddLog) {
        onAddLog(
          'ACTION_FAILED',
          `Backend unreachable: ${errorMsg}`,
          { status: 'failure', payload: { error: String(err) } }
        );
      }
    }
  };

  return (
    <header className="app-header-container">
      <div className="app-header">
        <div className="header-left">
          <div className="header-icon-box">
            <Bot className="brand-robot-icon text-indigo-500" size={24} />
          </div>
          <div>
            <div className="brand-title-wrap">
              <h1 className="brand-title">AgentQuest</h1>
              <span className="phase-badge">Phase 2: AI Integration</span>
            </div>
            <p className="brand-subtitle">The AI Escape Challenge • Google DevFest 2026</p>
          </div>
        </div>

        <div className="header-right">
          {/* Mode Selector */}
          <div className="mode-selector-pill" role="radiogroup" aria-label="Game Mode">
            <button
              className={`mode-btn ${gameMode === 'manual' ? 'active' : ''}`}
              onClick={() => onModeChange && onModeChange('manual')}
              disabled={isRunning}
              type="button"
              title="Manual Mode: Human player drives tool calls"
            >
              <span>🎮 Manual</span>
            </button>
            <button
              className={`mode-btn ${gameMode === 'agent' ? 'active' : ''}`}
              onClick={() => onModeChange && onModeChange('agent')}
              disabled={isRunning}
              type="button"
              title="AI Agent Mode: Gemini autonomously drives tool calls"
            >
              <span>🤖 AI Agent</span>
            </button>
          </div>

          {/* AI Connection Status Badge */}
          <div
            className={`ai-status-pill status-${aiStatus}`}
            title={`Gemini Status: ${aiStatus.replace('_', ' ')}`}
          >
            <span className={`ai-dot dot-${aiStatus}`}></span>
            <span className="ai-status-text">
              {aiStatus === 'not_connected' && 'AI Not Connected'}
              {aiStatus === 'connecting' && 'AI Connecting...'}
              {aiStatus === 'connected' && (testResult?.provider === 'groq' ? '⚡ Groq Connected' : '✨ AI Connected')}
              {aiStatus === 'failed' && 'Connection Failed'}
            </span>
          </div>

          {/* Test AI Connection Button */}
          <button
            className="btn btn-primary btn-sm btn-ai-test"
            onClick={handleTestConnection}
            disabled={aiStatus === 'connecting'}
            title="Test connection to Groq (Primary) and Gemini (Fallback)"
          >
            {aiStatus === 'connecting' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            <span>{aiStatus === 'connecting' ? 'Testing...' : 'Test AI Connection'}</span>
          </button>

          {/* Reset Maze Button */}
          <button
            className="btn btn-secondary btn-sm header-reset-btn"
            onClick={onReset}
            title="Reset maze to starting position"
          >
            <RotateCcw size={15} />
            <span>Reset Maze</span>
          </button>
        </div>
      </div>

      {/* AI Connection Result Banner */}
      {testResult && (
        <div
          className={`ai-feedback-banner ${
            testResult.loading
              ? 'banner-loading'
              : testResult.success
              ? 'banner-success'
              : 'banner-error'
          }`}
        >
          <div className="banner-content">
            {testResult.loading ? (
              <Loader2 size={16} className="animate-spin text-amber-600" />
            ) : testResult.success ? (
              <CheckCircle2 size={16} className="text-emerald-600" />
            ) : (
              <AlertCircle size={16} className="text-rose-600" />
            )}
            <div className="banner-text-wrap">
              <span className="banner-text">
                {testResult.message}
              </span>
              {testResult.model && (
                <span className="banner-model-tag font-mono">[{testResult.model}]</span>
              )}
            </div>
          </div>
          <button
            className="banner-close-btn"
            onClick={() => setTestResult(null)}
            title="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </header>
  );
}
