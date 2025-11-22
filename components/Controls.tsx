import React from 'react';
import { Play, Pause, RotateCcw, Activity, AlertTriangle, CheckCircle, Sun, Moon, Focus } from 'lucide-react';
import { SimulationStats, BodyState, ModeId } from '../types';
import { getModeOptions } from '../modes/registry';

interface ControlsProps {
  isRunning: boolean;
  setIsRunning: (v: boolean) => void;
  simulationSpeed: number;
  setSimulationSpeed: (v: number) => void;
  resetSimulation: (modeId: ModeId) => void;
  currentPreset: ModeId;
  stats: SimulationStats;
  bodies: BodyState[];
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  onResetCamera: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  isRunning,
  setIsRunning,
  simulationSpeed,
  setSimulationSpeed,
  resetSimulation,
  currentPreset,
  stats,
  theme,
  setTheme,
  onResetCamera
}) => {
  // Dynamic Styles
  const isDark = theme === 'dark';

  const containerClass = isDark
    ? "backdrop-blur-md border border-white/10 text-gray-200 shadow-2xl shadow-black/50"
    : "backdrop-blur-md border border-gray-200 text-gray-900 shadow-xl shadow-gray-500/15";

  const containerBgStyle = isDark
    ? { backgroundColor: '#333333' }
    : { backgroundColor: '#F9F9F9' };

  const labelClass = isDark ? "text-gray-500" : "text-gray-800";
  const headerTextClass = isDark ? "text-cyan-400" : "text-cyan-700";
  const subTextClass = isDark ? "text-gray-400" : "text-gray-700";

  const buttonActive = isDark
    ? "bg-cyan-900/50 border-cyan-500 text-cyan-100 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
    : "bg-cyan-100 border-cyan-500 text-cyan-900 shadow-[0_0_6px_rgba(6,182,212,0.25)]";

  const buttonInactive = isDark
    ? "bg-gray-900/50 border-gray-700 text-gray-400 hover:border-gray-500"
    : "bg-white border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50 shadow-sm";

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
      {/* Top Header */}
      <div className="flex justify-between items-start pointer-events-auto gap-4">
        <div className={`${containerClass} p-4 rounded-lg max-w-md transition-colors duration-300`} style={containerBgStyle}>
          <div className="flex items-center justify-between mb-1">
            <h1 className={`text-2xl font-bold ${headerTextClass} tracking-wider uppercase flex items-center gap-2`}>
              <Activity className="w-5 h-5" /> Trisolaris
            </h1>
            <button 
               onClick={() => setTheme(isDark ? 'light' : 'dark')}
               className={`p-2 rounded-full transition-colors ${isDark ? 'hover:bg-white/10 text-yellow-400' : 'hover:bg-black/5 text-slate-600'}`}
               title="Toggle Theme"
            >
               {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
          <p className={`text-xs ${subTextClass} font-mono`}>3-Body Physics Engine</p>
          
          <div className="mt-4 space-y-2">
            <label className={`text-xs font-bold ${labelClass} uppercase`}>Scenario Preset</label>
            <div className="flex flex-wrap gap-2">
              {getModeOptions().map(m => (
                <button
                  key={m.id}
                  onClick={() => resetSimulation(m.id)}
                  className={`px-3 py-1 text-xs rounded border transition-all ${
                    currentPreset === m.id ? buttonActive : buttonInactive
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats Panel */}
        <div className={`${containerClass} p-4 rounded-lg w-64 font-mono text-xs pointer-events-auto transition-colors duration-300`} style={containerBgStyle}>
            <h3 className={`font-bold mb-2 border-b pb-1 ${isDark ? 'text-gray-400 border-gray-700' : 'text-gray-700 border-gray-300'}`}>Telemetry</h3>
            <div className="space-y-2">
                <div className="flex justify-between">
                    <span className={labelClass}>Sys Energy:</span>
                    <span className={Math.abs(stats.totalEnergy) > 1000 ? 'text-red-500 font-bold' : (isDark ? 'text-cyan-300' : 'text-cyan-800 font-semibold')}>
                        {stats.totalEnergy.toFixed(2)} J
                    </span>
                </div>
                <div className="flex justify-between">
                    <span className={labelClass}>Kinetic:</span>
                    <span className={isDark ? "text-orange-300" : "text-orange-700"}>{stats.kineticEnergy.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                    <span className={labelClass}>Potential:</span>
                    <span className={isDark ? "text-blue-300" : "text-blue-700"}>{stats.potentialEnergy.toFixed(2)}</span>
                </div>
                 <div className="flex justify-between">
                    <span className={labelClass}>FPS:</span>
                    <span className={isDark ? "text-green-300" : "text-green-700"}>{Math.round(stats.fps)}</span>
                </div>
                 <div className={`flex justify-between items-center mt-2 pt-2 border-t ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                    <span className={labelClass}>Planet Status:</span>
                    {stats.habitable ? (
                        <span className="text-green-500 font-bold flex items-center gap-1"><CheckCircle size={12}/> Habitable</span>
                    ) : (
                        <span className="text-red-500 font-bold flex items-center gap-1"><AlertTriangle size={12}/> Extreme</span>
                    )}
                </div>
            </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="flex justify-center pointer-events-auto">
        <div className={`${containerClass} p-2 rounded-xl flex items-center gap-6 transition-colors duration-300`} style={containerBgStyle}>
            <button 
                onClick={() => setIsRunning(!isRunning)}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                    isRunning 
                    ? 'bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 border border-amber-500/50' 
                    : 'bg-green-500/20 text-green-500 hover:bg-green-500/30 border border-green-500/50'
                }`}
            >
                {isRunning ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
            </button>

            <button 
                onClick={() => resetSimulation(currentPreset)}
                className={`p-3 rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-600 hover:text-black hover:bg-black/5'}`}
                title="Restart Scenario"
            >
                <RotateCcw size={20} />
            </button>

            <button 
                onClick={onResetCamera}
                className={`p-3 rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10' : 'text-gray-600 hover:text-cyan-600 hover:bg-cyan-100/50'}`}
                title="Reset Camera View"
            >
                <Focus size={20} />
            </button>

            <div className={`h-8 w-px mx-2 ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`}></div>

            <div className="flex flex-col gap-1 min-w-[150px]">
                <div className={`flex justify-between text-xs font-mono ${subTextClass}`}>
                    <span>Sim Speed</span>
                    <span>{simulationSpeed.toFixed(1)}x</span>
                </div>
                <input 
                    type="range" 
                    min="0.1" 
                    max="10.0"
                    step={simulationSpeed <= 1 ? 0.1 : 0.5}
                    value={simulationSpeed}
                    onChange={(e) => {
                      const raw = parseFloat(e.target.value);
                      let next: number;
                      if (raw <= 1.0) {
                        // Snap to 0.1 increments between 0.1 and 1.0
                        next = Math.min(1.0, Math.max(0.1, Math.round(raw * 10) / 10));
                      } else {
                        // Snap upward to 0.5 increments starting from 1.0 up to 10.0: 1.0, 1.5, 2.0, ...
                        const snapped = 1.0 + Math.ceil((raw - 1.0) / 0.5) * 0.5;
                        next = Math.min(10.0, Math.max(1.0, parseFloat(snapped.toFixed(1))));
                      }
                      setSimulationSpeed(next);
                    }}
                    className={`accent-cyan-500 h-1 ${isDark ? 'bg-gray-500/30' : 'bg-slate-200'} rounded-lg cursor-pointer`}
                />
            </div>
            <div></div>

        </div>
      </div>
    </div>
  );
};