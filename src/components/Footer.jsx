import React from 'react';
import { Target, Terminal, Cpu, Eye, ArrowRight, Sparkles } from 'lucide-react';

export function Footer() {
  return (
    <footer className="app-footer">
      <div className="agent-loop-card">
        <div className="loop-card-header">
          <Sparkles size={16} className="text-indigo-500" />
          <h3 className="loop-title">The Autonomous Agent Loop (DevFest 2026 Core Concept)</h3>
        </div>

        <div className="loop-diagram">
          <div className="loop-node">
            <Target size={16} className="text-indigo-600" />
            <span className="loop-node-title">1. Goal</span>
            <span className="loop-node-desc">Escape the 9×9 maze</span>
          </div>

          <ArrowRight size={16} className="loop-arrow" />

          <div className="loop-node">
            <Terminal size={16} className="text-indigo-600" />
            <span className="loop-node-title">2. Tool Call</span>
            <span className="loop-node-desc">look(), move(), unlock()</span>
          </div>

          <ArrowRight size={16} className="loop-arrow" />

          <div className="loop-node">
            <Cpu size={16} className="text-indigo-600" />
            <span className="loop-node-title">3. Engine Execution</span>
            <span className="loop-node-desc">Validate walls & doors</span>
          </div>

          <ArrowRight size={16} className="loop-arrow" />

          <div className="loop-node">
            <Eye size={16} className="text-indigo-600" />
            <span className="loop-node-title">4. Observation</span>
            <span className="loop-node-desc">Structured feedback JSON</span>
          </div>

          <ArrowRight size={16} className="loop-arrow" />

          <div className="loop-node">
            <Sparkles size={16} className="text-indigo-600" />
            <span className="loop-node-title">5. Next Decision</span>
            <span className="loop-node-desc">Adapt & repeat</span>
          </div>
        </div>
      </div>

      <div className="footer-credits">
        <span>AgentQuest — The AI Escape Challenge</span>
        <span className="footer-divider">•</span>
        <span>Google DevFest Ranchi 2026</span>
        <span className="footer-divider">•</span>
        <span className="text-indigo-600 font-medium">Phase 1: Environment & Tool Protocol</span>
      </div>
    </footer>
  );
}

