import React, { useMemo, useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Activity, AlertTriangle, CheckCircle, Sun, Moon, Focus, Sliders } from 'lucide-react';
import { SimulationStats, BodyState, ModeId, ParameterMeta } from '../types';
import { getModeOptions } from '../modes/registry';
import { GlobalParams, getGlobalParameterSchema } from '../parameters/global';

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
  // Global params (schema-driven)
  globalParams: GlobalParams;
  onChangeGlobalParams: (next: GlobalParams) => void;
  onApplyGlobalParams: () => void;
  // Mode params (schema-driven)
  modeParameterSchema: ParameterMeta[];
  modeParams: Record<string, any>;
  onChangeModeParams: (next: Record<string, any>) => void;
  onApplyModeParams: () => void;
  statsSampleIntervalMs: number;
  setStatsSampleIntervalMs: (ms: number) => void;
}

export const Controls: React.FC<ControlsProps> = ({
  isRunning,
  setIsRunning,
  simulationSpeed,
  setSimulationSpeed,
  resetSimulation,
  currentPreset,
  stats,
  bodies,
  theme,
  setTheme,
  onResetCamera,
  globalParams,
  onChangeGlobalParams,
  onApplyGlobalParams,
  modeParameterSchema,
  modeParams,
  onChangeModeParams,
  onApplyModeParams,
  statsSampleIntervalMs,
  setStatsSampleIntervalMs
}) => {
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

  const schema = useMemo<ParameterMeta[]>(() => getGlobalParameterSchema(), []);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [telemetryAdvancedOpen, setTelemetryAdvancedOpen] = useState(false);

  // simple controlled draft uses parent globalParams directly
  const params = globalParams;

  function setParam(key: keyof GlobalParams, value: number) {
    const next = { ...params, [key]: value } as GlobalParams;
    onChangeGlobalParams(next);
  }

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
      {/* Top Header */}
      <div className="flex justify-between items-start pointer-events-auto gap-4">
        <div className={`${containerClass} p-4 rounded-lg max-w-md transition-colors duration-300`} style={containerBgStyle}>
          <div className="flex items-center justify-between mb-1">
            <h1 className={`text-2xl font-bold ${headerTextClass} tracking-wider uppercase flex items-center gap-2`}>
              <Activity className="w-5 h-5" /> Trisolaris
            </h1>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setAdvancedOpen(v => !v)}
                className={`p-2 rounded-full transition-colors ${isDark ? 'hover:bg-white/10 text-cyan-300' : 'hover:bg-black/5 text-cyan-700'}`}
                title="Advanced Parameters"
              >
                <Sliders size={18} />
              </button>
              <button
                 onClick={() => setTheme(isDark ? 'light' : 'dark')}
                 className={`p-2 rounded-full transition-colors ${isDark ? 'hover:bg-white/10 text-yellow-400' : 'hover:bg-black/5 text-slate-600'}`}
                 title="Toggle Theme"
              >
                 {isDark ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
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

          {advancedOpen && (
            <div className="mt-4 pt-3 border-t" style={{ borderColor: isDark ? '#374151' : '#e5e7eb' }}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold uppercase ${labelClass}`}>Global Parameters</span>
                <button
                  onClick={onApplyGlobalParams}
                  className={`px-2 py-1 text-xs rounded border ${isDark ? 'border-cyan-500 text-cyan-300 hover:bg-cyan-500/10' : 'border-cyan-600 text-cyan-700 hover:bg-cyan-100'}`}
                  title="Apply parameters (restarts physics kernel)"
                >
                  Apply
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {schema.map(meta => (
                  <div key={meta.key} className="flex flex-col gap-1">
                    <div className={`flex justify-between text-xs font-mono ${subTextClass}`}>
                      <span>{meta.label}</span>
                      <span>{(params as any)[meta.key]}</span>
                    </div>
                    <input
                      type="range"
                      min={meta.min ?? 0}
                      max={meta.max ?? 1}
                      step={meta.step ?? 0.01}
                      value={(params as any)[meta.key]}
                      onChange={(e) => setParam(meta.key as keyof GlobalParams, parseFloat(e.target.value))}
                      className={`accent-cyan-500 h-1 ${isDark ? 'bg-gray-500/30' : 'bg-slate-200'} rounded-lg cursor-pointer`}
                    />
                  </div>
                ))}
              </div>

              {/* Mode parameters */}
              {modeParameterSchema.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold uppercase ${labelClass}`}>Mode Parameters</span>
                    <button
                      onClick={onApplyModeParams}
                      className={`px-2 py-1 text-xs rounded border ${isDark ? 'border-indigo-500 text-indigo-300 hover:bg-indigo-500/10' : 'border-indigo-600 text-indigo-700 hover:bg-indigo-100'}`}
                      title="Apply mode parameters (hot-swap controller)"
                    >
                      Apply
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {modeParameterSchema.map(meta => (
                      <div key={meta.key} className="flex flex-col gap-1">
                        <div className={`flex justify-between text-xs font-mono ${subTextClass}`}>
                          <span>{meta.label}</span>
                          <span>{(modeParams as any)[meta.key]}</span>
                        </div>
                        <input
                          type="range"
                          min={meta.min ?? 0}
                          max={meta.max ?? 1}
                          step={meta.step ?? 0.01}
                          value={(modeParams as any)[meta.key] ?? meta.default}
                          onChange={(e) => onChangeModeParams({ ...modeParams, [meta.key]: parseFloat(e.target.value) })}
                          className={`accent-indigo-500 h-1 ${isDark ? 'bg-gray-500/30' : 'bg-slate-200'} rounded-lg cursor-pointer`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stats Panel (Info) */}
        <div className={`${containerClass} p-4 rounded-lg w-64 font-mono text-xs pointer-events-auto transition-colors duration-300`} style={containerBgStyle}>
            {/* Info Title */}
            <div className="flex items-center justify-between mb-2">
              <h3 className={`font-bold ${isDark ? 'text-gray-400' : 'text-gray-700'} uppercase text-xs`}>
                Info
              </h3>
              <button
                onClick={() => setTelemetryAdvancedOpen(v => !v)}
                className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-white/10 text-cyan-300' : 'hover:bg-black/5 text-cyan-700'}`}
                title="Advanced Info"
              >
                <Sliders size={14} />
              </button>
            </div>
            <div className="space-y-2">
                {/* Time Information */}
                <div className="flex justify-between">
                    <span className={labelClass}>Time:</span>
                    <span className={isDark ? "text-cyan-300" : "text-cyan-700"}>{stats.timeElapsed.toFixed(1)}</span>
                </div>
                <div className={`flex justify-between text-[11px] ${subTextClass} -mt-1`}>
                    <span></span>
                    <span>Physics Units</span>
                </div>

                <div className="flex justify-between">
                    <span className={labelClass}>FPS:</span>
                    <span className={isDark ? "text-green-300" : "text-green-700"}>{Math.round(stats.fps)}</span>
                </div>

                {telemetryAdvancedOpen && (
                  <>
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
                     <div className={`flex justify-between items-center mt-2 pt-2 border-t ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                        <span className={labelClass}>Planet Status:</span>
                        {stats.habitable ? (
                            <span className="text-green-500 font-bold flex items-center gap-1"><CheckCircle size={12}/> Habitable</span>
                        ) : (
                            <span className="text-red-500 font-bold flex items-center gap-1"><AlertTriangle size={12}/> Extreme</span>
                        )}
                    </div>
                  </>
                )}

                <div className={`pt-2 border-t space-y-1 ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                  <div className="flex justify-between items-center">
                    <span className={labelClass}>Sampling Interval</span>
                    <span className={isDark ? 'text-cyan-200' : 'text-cyan-700'}>{statsSampleIntervalMs} ms</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={1000}
                    step={50}
                    value={statsSampleIntervalMs}
                    onChange={(e) => setStatsSampleIntervalMs(parseInt(e.target.value, 10))}
                    className={`w-full accent-cyan-500 h-1 ${isDark ? 'bg-gray-500/30' : 'bg-slate-200'} rounded-lg cursor-pointer`}
                  />
                  <p className={`text-[10px] leading-tight ${subTextClass}`}>
                    Lower values improve accuracy; higher values reduce UI overhead.
                  </p>
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
                        next = Math.min(1.0, Math.max(0.1, Math.round(raw * 10) / 10));
                      } else {
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
