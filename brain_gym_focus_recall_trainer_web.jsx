import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { Play, Pause, Maximize, Minimize, Brain, TimerReset, Trophy, Sparkles, Shield, Smartphone, TrendingUp, Repeat, Bug, XCircle, ListOrdered, Sun, Moon } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// =====================================
// THEME & HELPERS
// =====================================
const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

const COLORS = {
  math:   { light: "#2563eb", dark: "#93c5fd" },       // blue shades
  recall: { light: "#16a34a", dark: "#228B22" },       // green shades (dark = forest)
  pattern:{ light: "#9333ea", dark: "#d8b4fe" },       // purple
  words:  { light: "#dc2626", dark: "#fca5a5" },       // red
  puzzle: { light: "#f59e0b", dark: "#fcd34d" },       // amber
  chart:  { light: "#0ea5e9", dark: "#38bdf8" },       // cyan
};
const accent = (game) => prefersDark ? COLORS[game].dark : COLORS[game].light;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const fmtDate = (d) => d.toISOString().slice(0,10);
const todayKey = () => fmtDate(new Date());

function groupMisses(list){
  if(!Array.isArray(list)) return {};
  return list.reduce((acc,m)=>{ const k=m?.game||'unknown'; (acc[k]=acc[k]||[]).push(m); return acc; },{});
}

// Recall difficulty: keep colors constant, grow SEQUENCE LENGTH by streak
const recallSeqLenForStreakRound = (streak, round) => {
  if (streak >= 12) return clamp(6 + Math.floor((streak - 12)/3), 6, 10);
  if (streak >= 6) return (round % 2 === 0 ? 4 : 5);
  return 3;
};

// LocalStorage keys
const LS = {
  XP: "braingym_xp_by_day",
  STREAK: "braingym_streak",
  LAST_DAY: "braingym_last_day",
  SETTINGS: "braingym_settings",
  MISSES: "braingym_misses_by_day",
  GAME_STATS: "braingym_game_stats", // per-game stats → isolates difficulty
  THEME: "braingym_theme",
};

const DEFAULT_SESSION_MIN = 25;

// Key for install banner snooze
const INSTALL_DISMISSED_KEY = 'braingym_install_dismissed';

// Small util wrappers
const safeGet = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k) || fallback); } catch { return JSON.parse(fallback); }
};
const safeSet = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch {} };

// =====================================
// MAIN APP
// =====================================
export default function BrainGym(){
  // Theme
  const [theme, setTheme] = useState(()=>{
    try { return localStorage.getItem(LS.THEME) || (prefersDark ? 'dark' : 'light'); } catch { return prefersDark ? 'dark' : 'light'; }
  });
  const isDark = theme === 'dark';
  const accentColor = (game) => (isDark ? COLORS[game].dark : COLORS[game].light);
  useEffect(()=>{ try { localStorage.setItem(LS.THEME, theme); } catch {};
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDark);
    }
  }, [theme]);

  // PWA: register service worker for offline/install (works with vite-plugin-pwa output `/sw.js`)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
      if (document.readyState === 'complete') register();
      else window.addEventListener('load', register, { once: true });
    }
  }, []);
  // Timer + session
  const [sessionLen, setSessionLen] = useState(()=>{
    try{ const s = JSON.parse(localStorage.getItem(LS.SETTINGS)||'{}'); return s.sessionLen ?? DEFAULT_SESSION_MIN; }catch{return DEFAULT_SESSION_MIN;}
  });
  const [secondsLeft, setSecondsLeft] = useState(sessionLen*60);
  const [running, setRunning] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  // Register service worker (works with vite-plugin-pwa output `/sw.js`)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
      if (document.readyState === 'complete') register();
      else window.addEventListener('load', register, { once: true });
    }
  }, []);

  // Tabs & totals
  const [tab, setTab] = useState('math');
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [level, setLevel] = useState(1);

  // Per-game stats (XP/streak per domain)
  const [gameStats, setGameStats] = useState(()=>{
    try{
      const parsed = JSON.parse(localStorage.getItem(LS.GAME_STATS)||'{}');
      return {
        math:   { xp:0, streak:0, lastDay:null, ...(parsed.math||{}) },
        recall: { xp:0, streak:0, lastDay:null, ...(parsed.recall||{}) },
        pattern:{ xp:0, streak:0, lastDay:null, ...(parsed.pattern||{}) },
        anagram:{ xp:0, streak:0, lastDay:null, ...(parsed.anagram||{}) },
        puzzle: { xp:0, streak:0, lastDay:null, ...(parsed.puzzle||{}) },
      };
    }catch{ return { math:{xp:0,streak:0,lastDay:null}, recall:{xp:0,streak:0,lastDay:null}, pattern:{xp:0,streak:0,lastDay:null}, anagram:{xp:0,streak:0,lastDay:null}, puzzle:{xp:0,streak:0,lastDay:null} }; }
  });
  const saveGameStats = (next)=>{ safeSet(LS.GAME_STATS, next); setGameStats(next); };
  const addGameXP = (game, delta)=>{
    const day = todayKey();
    const cur = gameStats[game]||{xp:0, streak:0, lastDay:null};
    saveGameStats({ ...gameStats, [game]: { xp: clamp((cur.xp||0)+Math.max(0,delta),0,1_000_000), streak:(cur.streak||0)+1, lastDay:day } });
  };
  const recordGameMiss = (game)=>{
    const cur = gameStats[game]||{xp:0, streak:0, lastDay:null};
    saveGameStats({ ...gameStats, [game]: { ...cur, streak:0 } });
  };

  // Misses (by day) for feedback
  const [misses, setMisses] = useState(()=>{
    try{ const map = JSON.parse(localStorage.getItem(LS.MISSES)||'{}'); return Array.isArray(map[todayKey()])?map[todayKey()]:[]; }catch{return []}
  });
  const recordMiss = (m)=>{
    const day = todayKey();
    const map = safeGet(LS.MISSES, '{}');
    const list = Array.isArray(map[day])?map[day]:[]; list.push(m);
    map[day]=list; safeSet(LS.MISSES, map); setMisses(list);
  };

  // XP totals for chart (last 30 days)
  const [chartData, setChartData] = useState(()=>{
    const map = safeGet(LS.XP, '{}');
    const arr = [];
    for(let i=29;i>=0;i--){ const d = new Date(); d.setDate(d.getDate()-i); const k = fmtDate(d); arr.push({date:k, xp: (map[k]||0)}); }
    return arr;
  });

  const addXP = (points)=>{
    const day = todayKey();
    const map = safeGet(LS.XP, '{}');
    map[day] = (map[day]||0)+points; safeSet(LS.XP, map);
    setXp((x)=>x+points);
    setLevel((L)=> clamp(L + points/50, 1, 99));
    setStreak((s)=> s+1);
    setChartData((data)=> data.map(d=> d.date===day?{...d, xp:(map[day]||0)}:d));
  };

  // Timer engine
  useEffect(()=>{ if(!running) return; const id=setInterval(()=> setSecondsLeft((s)=> Math.max(0, s-1)), 1000); return ()=>clearInterval(id); },[running]);
  useEffect(()=>{ safeSet(LS.SETTINGS, { sessionLen }); },[sessionLen]);

  const resetTimer = ()=> setSecondsLeft(sessionLen*60);

  // Summary modal toggle
  const [showSummary, setShowSummary] = useState(false);

  // PWA install banner state
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const isiOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (typeof navigator !== 'undefined' && (navigator).standalone === true);

  useEffect(() => {
    const dismissedAt = Number(localStorage.getItem(INSTALL_DISMISSED_KEY) || 0);
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const recentlyDismissed = Date.now() - dismissedAt < weekMs;

    function onBIP(e) {
      e.preventDefault();
      setInstallPrompt(e);
      if (!recentlyDismissed && !isStandalone) setShowInstall(true);
    }
    function onInstalled() { setShowInstall(false); setInstallPrompt(null); }

    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);

    if (isiOS && !recentlyDismissed && !isStandalone) setShowInstall(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  const dismissInstall = () => { try { localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now())); } catch {} setShowInstall(false); };
  const triggerInstall = async () => {
    if (installPrompt && typeof installPrompt.prompt === 'function') {
      installPrompt.prompt();
      try {
        const choice = await installPrompt.userChoice;
        if (!choice || choice.outcome !== 'accepted') dismissInstall();
      } catch { dismissInstall(); }
      setInstallPrompt(null);
    } else if (isiOS) {
      // iOS: no prompt; instructions shown in banner
    }
  };

  return (
    <div className={`max-w-5xl mx-auto p-4 min-h-screen ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-white text-zinc-900'}`}>
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-6 h-6" style={{color:accentColor('math')}}/>
          <h1 className="text-xl font-bold">BrainGym — Focus & Recall Trainer</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Smartphone className="w-4 h-4 text-zinc-400"/>
            <span className="text-zinc-400 hidden sm:inline">Theme</span>
            <Button variant="outline" className="h-8 px-2" onClick={()=> setTheme(isDark ? 'light' : 'dark')} style={{ borderColor: accentColor('chart') }}>
              {isDark ? <Sun className="w-4 h-4"/> : <Moon className="w-4 h-4"/>}
            </Button>
          </div>
        </div>
      </header>

      {/* Install App Banner */}
      {showInstall && !isStandalone && (
        <div className="mb-4">
          <div className={`shadow-xl border rounded-2xl max-w-3xl mx-auto w-full p-3 ${prefersDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <div className="font-semibold">Install BrainGym</div>
                {isiOS ? (
                  <div className="text-sm opacity-80">On iPhone: tap <b>Share</b> → <b>Add to Home Screen</b> to install.</div>
                ) : (
                  <div className="text-sm opacity-80">Install for full-screen & offline use. No App Store needed.</div>
                )}
              </div>
              {!isiOS && (
                <Button onClick={triggerInstall} style={{ backgroundColor: accent('chart'), color: '#0b0b0b' }}>Install</Button>
              )}
              <Button variant="outline" onClick={dismissInstall} style={{ borderColor: accent('words') }}>Not now</Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {/* LEFT: Session & Progress */}
        <div className="md:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TimerReset className="w-5 h-5 text-zinc-300"/>
                Focus Block
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-4xl font-semibold" style={{color:accentColor('pattern')}}>
                {Math.floor(secondsLeft/60).toString().padStart(2,'0')}:{(secondsLeft%60).toString().padStart(2,'0')}
              </div>
              <div className="flex gap-2">
                <Button onClick={()=>setRunning(!running)} style={{backgroundColor:accentColor('words'), color:'#0b0b0b'}}>
                  {running? <Pause className="w-4 h-4"/> : <Play className="w-4 h-4"/>}
                </Button>
                <Button variant="outline" onClick={resetTimer} style={{borderColor:accentColor('words')}}>
                  Reset
                </Button>
                <Input type="number" className="w-20" value={sessionLen} onChange={(e)=>setSessionLen(clamp(Number(e.target.value)||DEFAULT_SESSION_MIN, 5, 120))}/>
                <span className="text-sm text-zinc-400">min</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Shield className="w-4 h-4"/> Require click to reset timer ✔︎
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" style={{ color: prefersDark ? '#FFF1C9' : '#7C4A00' }} />
                <span style={{ color: prefersDark ? '#FFF1C9' : '#7C4A00' }}>Progress (last 30 days)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{left:4,right:4,top:8,bottom:0}}>
                    <defs>
                      <linearGradient id="xpFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={accentColor('chart')} stopOpacity={0.6}/>
                        <stop offset="95%" stopColor={accentColor('chart')} stopOpacity={0.05}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1}/>
                    <XAxis dataKey="date" hide/>
                    <YAxis hide/>
                    <Tooltip contentStyle={{ background: isDark ? '#0b0b0c' : '#ffffff', border: isDark ? '1px solid #333' : '1px solid #e5e7eb', color: isDark ? '#fff' : '#111' }}/>
                    <Area type="monotone" dataKey="xp" stroke={accentColor('chart')} fill="url(#xpFill)" strokeWidth={2}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListOrdered className="w-5 h-5 text-zinc-300"/> Daily Stats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><Trophy className="w-4 h-4" style={{color:accentColor('puzzle')}}/> Level <b>{Math.floor(level)}</b></div>
              <div className="flex items-center gap-2"><Sparkles className="w-4 h-4" style={{color:accentColor('recall')}}/> Streak <b>{streak}</b></div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Games */}
        <div className="md:col-span-2">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-5">
              <TabsTrigger value="math">Math</TabsTrigger>
              <TabsTrigger value="recall">Recall</TabsTrigger>
              <TabsTrigger value="pattern">Pattern</TabsTrigger>
              <TabsTrigger value="anagram">Words</TabsTrigger>
              <TabsTrigger value="puzzle">Puzzle</TabsTrigger>
            </TabsList>

            <TabsContent value="math"><MathBlitz dark={isDark} onScore={(p)=>{ addXP(p); addGameXP('math',p); }} onMiss={(m)=>{ recordMiss(m); recordGameMiss('math'); }} accent={accentColor('math')}/></TabsContent>
            <TabsContent value="recall"><RecallSequence dark={isDark} onScore={(p)=>{ addXP(p); addGameXP('recall',p); }} onMiss={(m)=>{ recordMiss(m); recordGameMiss('recall'); }} accent={accentColor('recall')}/></TabsContent>
            <TabsContent value="pattern"><PatternFinder dark={isDark} onScore={(p)=>{ addXP(p); addGameXP('pattern',p); }} onMiss={(m)=>{ recordMiss(m); recordGameMiss('pattern'); }} accent={accentColor('pattern')}/></TabsContent>
            <TabsContent value="anagram"><WordAnagram dark={isDark} onScore={(p)=>{ addXP(p); addGameXP('anagram',p); }} onMiss={(m)=>{ recordMiss(m); recordGameMiss('anagram'); }} accent={accentColor('words')}/></TabsContent>
            <TabsContent value="puzzle"><TilePuzzle dark={isDark} onScore={(p)=>{ addXP(p); addGameXP('puzzle',p); }} onMiss={(m)=>{ recordMiss(m); recordGameMiss('puzzle'); }} accent={accentColor('puzzle')}/></TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Session Summary */}
      {showSummary && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center">
          <div className="bg-zinc-900 p-4 rounded-xl max-w-md w-full">
            <h3 className="text-lg font-semibold mb-2">Session Summary</h3>
            <p className="text-sm text-zinc-400">Areas to improve:</p>
            <ul className="list-disc ml-6 my-2 text-sm">
              {Object.entries(groupMisses(misses)).map(([k,v])=> (
                <li key={k}><b>{k}</b>: {v.length} issue(s)</li>
              ))}
            </ul>
            <div className="text-right">
              <Button onClick={()=>setShowSummary(false)} style={{backgroundColor:accentColor('words'), color:'#0b0b0b'}}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================
// MATH — adaptive by Math-only stats (now with on-screen keypad)
// =====================================
function makeMathAdaptive(stats){
  const xp = stats?.xp||0; const st = stats?.streak||0;
  const stage = (st>=12||xp>=350)?4 : (st>=8||xp>=200)?3 : (st>=6||xp>=120)?2 : (st>=3||xp>=50)?1 : 0;
  const r=(a,b)=>Math.floor(Math.random()*(b-a+1))+a; const pick=(a)=>a[Math.floor(Math.random()*a.length)];
  if(stage===4){ const a=r(2,9), x=r(1,12), b=r(-15,15), c=a*x+b; return {text:`${a}x + ${b} = ${c} ; x = ?`, answer:x}; }
  if(stage===3){ const form=pick(["x + b = c","x - b = c","a - x = c"]);
    if(form==="x + b = c"){ const b=r(1,20), x=r(1,30), c=x+b; return {text:`x + ${b} = ${c} ; x = ?`, answer:x}; }
    if(form==="x - b = c"){ const x=r(10,40), b=r(1,9), c=x-b; return {text:`x - ${b} = ${c} ; x = ?`, answer:x}; }
    const a=r(10,40), x=r(1,9), c=a-x; return {text:`${a} - x = ${c} ; x = ?`, answer:x}; }
  if(stage===2){ const op=pick(["×","÷"]); if(op==='×'){ const a=r(3,12), b=r(3,12); return {text:`${a} × ${b} = ?`, answer:a*b}; } else { const b=r(2,12), x=r(2,12); return {text:`${b*x} ÷ ${b} = ?`, answer:x}; } }
  if(stage===1){ const a=r(-20,99), b=r(-20,99), op=pick(["+","-"]); const ans= op==='+'?a+b:a-b; return {text:`${a} ${op} ${b} = ?`, answer:ans}; }
  { const a=r(0,9), b=r(0,9), op=pick(["+","-"]); const ans= op==='+'?a+b:a-b; return {text:`${a} ${op} ${b} = ?`, answer:ans}; }
}

function MathBlitz({ onScore, onMiss, accent, dark }){
  // read/write Math-only stats
  const readStats=()=>{ try{ const map=JSON.parse(localStorage.getItem(LS.GAME_STATS)||'{}'); const m=map.math||{xp:0,streak:0,lastDay:null}; return {xp:m.xp||0,streak:m.streak||0,lastDay:m.lastDay||null}; }catch{return {xp:0,streak:0,lastDay:null}} };
  const writeStats=(next)=>{ try{ const map=JSON.parse(localStorage.getItem(LS.GAME_STATS)||'{}'); map.math=next; localStorage.setItem(LS.GAME_STATS, JSON.stringify(map)); }catch{} };

  const [level, setLevel] = useState(1);
  const [q, setQ] = useState(()=> makeMathAdaptive(readStats()));
  const [ans, setAns] = useState("");
  const [combo, setCombo] = useState(0);
  const inputRef = useRef(null);
  useEffect(()=>{ inputRef.current?.focus(); },[q]);

  const submit = ()=>{
    const correct = Number(ans) === q.answer;
    const base = 3 + Math.floor(level/2);
    const bonus = Math.min(combo, 5);
    const pts = correct ? base + bonus : 0;

    const cur = readStats(); const day=todayKey();
    const nextStats = correct ? { xp: clamp(cur.xp+pts,0,1_000_000), streak:(cur.streak||0)+1, lastDay:day } : { xp: cur.xp||0, streak:0, lastDay:day };
    writeStats(nextStats);

    if(correct){ onScore(pts); setCombo(combo+1); setLevel((L)=> Math.min(L + (combo>=3?1:0.5), 20)); }
    else { onMiss({game:'math', prompt:q.text, correct:q.answer, given: ans}); setCombo(0); setLevel((L)=> Math.max(1, L-0.5)); }

    setQ(makeMathAdaptive(nextStats)); setAns("");
  };

  // Keypad helpers
  const append = (ch)=> setAns((p)=> (p.length<10 ? (p==="0"? String(ch) : p + String(ch)) : p));
  const back = ()=> setAns((p)=> p.slice(0,-1));
  const clearAns = ()=> setAns("");
  const toggleSign = ()=> setAns((p)=> p.startsWith('-') ? p.slice(1) : (p? ('-'+p) : '-'));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <span>Math Level {Math.round(level*2)/2}</span>
        <span>• Combo {combo}</span>
      </div>
      <div className="text-4xl font-semibold" style={{color:accent}}>{q.text}</div>
      <div className="flex gap-2 items-center">
        <Input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          readOnly
          value={ans}
          onKeyDown={(e)=>{ if(e.key==='Enter') submit(); }}
          className="text-lg"
          style={{ background: dark ? '#17181a' : '#ffffff', borderColor: accent, color: dark ? '#fff' : '#111' }}
          placeholder="Answer"
        />
        <Button onClick={submit} style={{backgroundColor:accent, color:'#0b0b0b'}}>Submit</Button>
      </div>
      {/* On-screen keypad */}
      <div className="grid grid-cols-3 gap-2">
        {["7","8","9","4","5","6","1","2","3"].map(n=> (
          <Button key={n} variant="outline" onClick={()=>append(n)} style={{ borderColor: accent }}>{n}</Button>
        ))}
        <Button variant="outline" onClick={toggleSign} style={{ borderColor: accent }}>±</Button>
        <Button variant="outline" onClick={()=>append("0")} style={{ borderColor: accent }}>0</Button>
        <Button variant="outline" onClick={back} style={{ borderColor: accent }}>⌫</Button>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={clearAns} style={{ borderColor: accent }}>Clear</Button>
        <Button onClick={submit} style={{ backgroundColor: accent, color: '#0b0b0b' }}>Submit</Button>
      </div>
      <p className="text-xs text-zinc-500">Tip: use the keypad; no full keyboard needed.</p>
    </div>
  );
}

// =====================================
// RECALL — fixed palette, length scales by streak; show ≥ 3s
// =====================================
function RecallSequence({ onScore, onMiss, accent, dark }){
  const [round, setRound] = useState(1);
  const [seq, setSeq] = useState([]);
  const [showing, setShowing] = useState(false);
  const [input, setInput] = useState([]);
  const [streakR, setStreakR] = useState(0);

  const PALETTE = [accent, "#228B22", "#fde68a", "#fca5a5", "#a78bfa", "#67e8f9"];

  useEffect(()=>{ startRound(1,0); },[]);

  function startRound(n, s){
    const len = recallSeqLenForStreakRound(s, n);
    const sseq = Array.from({length:len}, ()=> Math.floor(Math.random()*PALETTE.length));
    setSeq(sseq); setShowing(true); setInput([]);
    setTimeout(()=> setShowing(false), Math.max(3000, len*500)); // min 3s
  }

  function clickColor(i){ if(showing) return; const next=[...input,i]; setInput(next);
    if(next.length===seq.length){ const ok = next.every((v,idx)=> v===seq[idx]);
      if(ok){ setStreakR(streakR+1); onScore(5+seq.length); const nr=round+1; setRound(nr); startRound(nr, streakR+1); }
      else { onMiss({game:'recall', round, len: seq.length}); setStreakR(0); const nr=Math.max(1,round-1); setRound(nr); startRound(nr,0); }
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-zinc-400">Round {round}: memorize the order. Length {seq.length} • Streak {streakR}</div>
      <div className="flex gap-2 flex-wrap">
        {seq.map((c,idx)=> (
          <div key={idx} className="w-10 h-10 rounded-lg border" style={{background: showing ? PALETTE[c] : (dark ? '#121318' : '#f2f3f5'), borderColor: accent}}/>
        ))}
      </div>
      <div className="grid gap-2" style={{gridTemplateColumns:`repeat(${PALETTE.length}, minmax(0,1fr))`}}>
        {PALETTE.map((c,i)=> (
          <button key={i} onClick={()=>clickColor(i)} className="h-10 rounded-lg border" style={{background:c, borderColor: accent}}/>
        ))}
      </div>
    </div>
  );
}

// =====================================
// PATTERN — simple "find the next"
// =====================================
function PatternFinder({ onScore, onMiss, accent, dark }){
  const r=(a,b)=>Math.floor(Math.random()*(b-a+1))+a; const pick=(a)=>a[Math.floor(Math.random()*a.length)];
  const makeQ = ()=>{
    const step = pick([2,3,4,5,7]); const start = r(1,12); const len = 5; const seq = Array.from({length:len},(_,i)=> start+i*step);
    return { seq, answer: start + len*step, text: seq.join(', ') + ', ?' };
  };
  const [q, setQ] = useState(makeQ());
  const [ans, setAns] = useState("");
  const submit=()=>{ const correct = Number(ans)===q.answer; if(correct){ onScore(6); setQ(makeQ()); setAns(""); } else { onMiss({game:'pattern', prompt:q.text, correct:q.answer, given:ans}); setAns(""); } };
  return (
    <div className="space-y-3">
      <div className="text-lg font-semibold" style={{color:accent}}>{q.text}</div>
      <div className="flex gap-2">
        <Input value={ans} onChange={(e)=>setAns(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter') submit(); }} className="text-lg" style={{ background: dark ? '#17181a' : '#ffffff', borderColor: accent, color: dark ? '#fff' : '#111' }} placeholder="Next"/>
        <Button onClick={submit} style={{backgroundColor:accent, color:'#0b0b0b'}}>Submit</Button>
      </div>
    </div>
  );
}

// =====================================
// WORDS — short anagrams (3–5 letters), longer as correct
// =====================================
const WORDS = ["tree","crate","stone","plane","trace","brain","focus","ratio","model","cable","flame","clean"]; // seed words
function shuffle(s){ return s.split('').sort(()=>Math.random()-0.5).join(''); }
function WordAnagram({ onScore, onMiss, accent, dark }){
  const [tier, setTier] = useState(0);
  const pool = useMemo(()=> WORDS.filter(w=> w.length>=3 && w.length<= (tier<3?5:6)),[tier]);
  const mk=()=>{ const w = pool[Math.floor(Math.random()*pool.length)]||'tree'; let s=shuffle(w); if(s===w) s=shuffle(w); return {w, s}; };
  const [q, setQ] = useState(mk());
  const [ans, setAns] = useState("");
  const submit=()=>{ const ok = ans.trim().toLowerCase()===q.w; if(ok){ onScore(5); setTier(t=>t+1); setQ(mk()); setAns(""); } else { onMiss({game:'anagram', prompt:q.s, correct:q.w, given:ans}); setAns(""); } };
  return (
    <div className="space-y-3">
      <div className="text-lg font-semibold" style={{color:accent}}>{q.s}</div>
      <div className="flex gap-2">
        <Input value={ans} onChange={(e)=>setAns(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter') submit(); }} className="text-lg" style={{ background: dark ? '#17181a' : '#ffffff', borderColor: accent, color: dark ? '#fff' : '#111' }} placeholder="Unscramble"/>
        <Button onClick={submit} style={{backgroundColor:accent, color:'#0b0b0b'}}>Submit</Button>
      </div>
    </div>
  );
}

// =====================================
// PUZZLE — image tiles
// =====================================
function isSolved(arr){ for(let i=0;i<arr.length;i++){ if(arr[i]!==i) return false; } return true; }
function makePuzzle(n){ const a=Array.from({length:n},(_,i)=>i).sort(()=>Math.random()-0.5); if(isSolved(a)) a.reverse(); return a; }
function TilePuzzle({ onScore, onMiss, accent, dark }){
  const pieceOptions=[6,8,10];
  const [idx, setIdx] = useState(0);
  const [tiles, setTiles] = useState(makePuzzle(pieceOptions[0]));
  const [sel, setSel] = useState(null);
  const [imgIdx, setImgIdx] = useState(0);

  const images = useMemo(()=>[
    "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=60",
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=60",
    "https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=1200&q=60",
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=60",
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=60",
    "https://images.unsplash.com/photo-1517816743773-6e0fd518b4a6?auto=format&fit=crop&w=1200&q=60",
  ],[]);

  const pieces = pieceOptions[idx];
  const layout = useMemo(()=> ({6:[2,3],8:[2,4],10:[2,5]})[pieces]||[3,3], [pieces]);
  const [rows, cols] = layout; const img = images[imgIdx % images.length];

  function clickTile(i){ if(sel===null){ setSel(i); return; } if(sel===i){ setSel(null); return; } const next=[...tiles]; const t=next[sel]; next[sel]=next[i]; next[i]=t; setTiles(next); setSel(null); }
  function check(){ if(isSolved(tiles)){ onScore(15+pieces); const nextIdx=Math.min(idx+1, pieceOptions.length-1); setIdx(nextIdx); setTiles(makePuzzle(pieceOptions[nextIdx])); } else { onMiss({game:'puzzle', pieces, image:imgIdx}); } }
  function changeImage(){ setImgIdx(n=>n+1); setTiles(makePuzzle(pieces)); setSel(null); }

  function pieceStyle(n){ const r=Math.floor(n/cols), c=n%cols; const posX= cols===1? '50%' : `${(c/(cols-1))*100}%`; const posY= rows===1? '50%' : `${(r/(rows-1))*100}%`; return { backgroundImage:`url(${img})`, backgroundSize:`${cols*100}% ${rows*100}%`, backgroundPosition:`${posX} ${posY}`, backgroundRepeat:'no-repeat', borderColor:accent } }

  return (
    <div className="space-y-3">
      <div className="text-sm text-zinc-400">Rebuild the picture ({rows}×{cols}). Click two tiles to swap, then Check.</div>
      <div className="grid gap-2" style={{gridTemplateColumns:`repeat(${cols}, minmax(0,1fr))`}}>
        {tiles.map((n,i)=> (
          <button key={i} onClick={()=>clickTile(i)} className="aspect-square rounded-md border overflow-hidden relative" style={{ borderColor: sel===i? '#ffffff':accent, boxShadow: sel===i? '0 0 0 2px #ffffff inset':'none' }} aria-label={`Tile ${i}`}>
            <div className="w-full h-full" style={pieceStyle(n)} />
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button onClick={check} style={{backgroundColor:accent, color:'#0b0b0b'}}>Check</Button>
        <Button variant="outline" onClick={()=>setTiles(makePuzzle(pieces))} style={{borderColor:accent}}>Shuffle</Button>
        <Button variant="outline" onClick={changeImage} style={{borderColor:accent}}>Change Image</Button>
      </div>
    </div>
  );
}
