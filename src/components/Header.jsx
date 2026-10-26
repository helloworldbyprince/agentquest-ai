import React, { useState } from 'react';
import { Bot, RotateCcw, Sparkles, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';

export function Header({ onReset, isRunning, onAddLog }) {
  const [aiStatus, setAiStatus] = useState('not_connected'); // 'not_connected' | 'connecting' | 'connected' | 'failed'
  const [testResult, setTestResult] = useState(null);

  const handleTestConnection = async () => {
    setAiStatus('connecting');
    setTestResult({
      loading: true,
      success: false,
      message: 'Connecting to Gemini API via Express backend...'
    });

    try {
      let response;
      try {
        response = await fetch('/api/gemini/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        // Fallback to direct backend if proxy is inactive or returning gateway/server errors
        if (!response.ok && response.status >= 500) {
          try {
            const fallbackResponse = await fetch('http://localhost:3001/api/gemini/test', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            response = fallbackResponse;
          } catch {
            // Keep original response
          }
        }
      } catch {
        // Network error on /api, try direct backend port
        response = await fetch('http://localhost:3001/api/gemini/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const data = await response.json();

      if (response.ok && data.success) {
        setAiStatus('connected');
        setTestResult({
          loading: false,
          success: true,
          model: data.model,
          message: data.message || 'AgentQuest AI connection successful.'
        });

        if (onAddLog) {
          onAddLog(
            'TOOL_RESULT',
            `Gemini API connected successfully (${data.model}): "${data.message}"`,
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
          {/* Manual Mode Badge */}
          <div className="mode-pill" title="Manual Exploration & Tool Verification">
            <span className="mode-indicator-dot"></span>
            <span className="mode-pill-text">Manual Mode</span>
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
              {aiStatus === 'connected' && 'Gemini Connected'}
              {aiStatus === 'failed' && 'Connection Failed'}
            </span>
          </div>

          {/* Test AI Connection Button */}
          <button
            className="btn btn-primary btn-sm btn-ai-test"
            onClick={handleTestConnection}
            disabled={aiStatus === 'connecting'}
            title="Send test prompt to Google Gemini API"
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
