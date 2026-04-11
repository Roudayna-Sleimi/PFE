import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";

const BASE_URL = "http://localhost:5000";

interface Machine { id: string; name: string; model?: string; type?: string; hasSensors?: boolean; }
interface Piece { _id: string; nom: string; machine: string; quantite: number; prix: number; status: "Terminé" | "En cours" | "Contrôle"; matiere: boolean; taches?: Tache[]; }
interface Tache { _id: string; titre: string; description?: string; statut: string; priorite?: string; }
interface Message { _id: string; from: string; fromRole: string; to: string; text: string; createdAt: string; }
interface TrackingEvent { type: "start" | "pause" | "resume" | "stop"; time: Date; pieceCount?: number; }
interface ProductionSession { machine: Machine; piece: Piece; startTime: Date; endTime?: Date; elapsed: number; totalPieces: number; statut: "en_cours" | "pause" | "terminee"; events: TrackingEvent[]; }
type Step = "machines" | "pieces" | "plan" | "production";

const fmt = (sec: number) => { const h = Math.floor(sec/3600); const m = Math.floor((sec%3600)/60); const s = sec%60; return h>0?`${h}h ${String(m).padStart(2,"0")}m ${String(s).padStart(2,"0")}s`:`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`; };
const SC: Record<string,string> = { "Terminé":"#10b981","En cours":"#3b82f6","Contrôle":"#f59e0b" };

const EmployePage: React.FC = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token") || "";
  const username = localStorage.getItem("username") || "";
  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgEndRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>("machines");
  const [tab, setTab] = useState<"workflow"|"messages">("workflow");
  const [unread, setUnread] = useState(0);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loadingM, setLoadingM] = useState(true);
  const [selectedMachine, setSelectedMachine] = useState<Machine|null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loadingP, setLoadingP] = useState(false);
  const [selectedPiece, setSelectedPiece] = useState<Piece|null>(null);
  const [session, setSession] = useState<ProductionSession|null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [count, setCount] = useState(0);
  const [saved, setSaved] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgText, setMsgText] = useState("");

  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  useEffect(() => {
    setLoadingM(true);
    fetch(`${BASE_URL}/api/machines`, { headers: authHeaders })
      .then(r=>r.json()).then((data:Machine[]) => { if(Array.isArray(data)) setMachines(data.filter(m=>!m.name.toLowerCase().includes("compresseur")&&!m.id?.toLowerCase().includes("compresseur"))); })
      .catch(console.error).finally(()=>setLoadingM(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPieces = useCallback((machineName: string) => {
    setLoadingP(true);
    fetch(`${BASE_URL}/api/pieces?machine=${encodeURIComponent(machineName)}`,{headers:authHeaders})
      .then(r=>r.json()).then((data:Piece[])=>{setPieces(Array.isArray(data)?data:[]);}).catch(()=>setPieces([])).finally(()=>setLoadingP(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch(`${BASE_URL}/api/messages/admin`,{headers:authHeaders}).then(r=>r.json()).then((data:Message[])=>{if(Array.isArray(data))setMessages(data);}).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(() => { msgEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages]);

  useEffect(() => {
    const socket = io(BASE_URL,{transports:["websocket"]});
    socketRef.current = socket;
    socket.emit("user-online",{username,role:"employe"});
    socket.on("direct-message",(data:Message)=>{ setMessages(prev=>[...prev,data]); if(tab!=="messages")setUnread(prev=>prev+1); });
    socket.on("alert",(data:{severity:string;message:string})=>{ const div=document.createElement("div"); div.style.cssText=`position:fixed;top:80px;right:24px;z-index:9999;padding:14px 18px;border-radius:12px;font-size:13px;font-weight:600;color:white;max-width:340px;cursor:pointer;background:${data.severity==="critical"?"#ef4444":"#f59e0b"};box-shadow:0 8px 24px rgba(0,0,0,0.4);`; div.innerHTML=`<div style="margin-bottom:4px">${data.severity==="critical"?"🚨 CRITIQUE":"⚠️ ATTENTION"}</div><div style="font-weight:400;opacity:.85;font-size:12px">${data.message}</div>`; div.onclick=()=>div.remove(); document.body.appendChild(div); setTimeout(()=>div.remove(),7000); });
    return ()=>{ socket.disconnect(); };
  },[username,tab]);

  useEffect(() => {
    if(session&&!isPaused&&session.statut==="en_cours"){timerRef.current=setInterval(()=>setElapsed(p=>p+1),1000);}
    else{if(timerRef.current)clearInterval(timerRef.current);}
    return ()=>{if(timerRef.current)clearInterval(timerRef.current);};
  },[session,isPaused]);

  const machineAction = async(action:"started"|"paused"|"stopped",pieceId?:string,pieceCount?:number,machineName?:string)=>{
    try{await fetch(`${BASE_URL}/api/employe/machine/action`,{method:"POST",headers:authHeaders,body:JSON.stringify({action,activity:action==="started"?`Production: ${selectedPiece?.nom}`:action==="paused"?"Pause opérateur":"Cycle terminé",pieceId:pieceId||null,pieceCount:pieceCount||null,machineName:machineName||null})});}catch(err){console.error(err);}
  };

  const startSession = async()=>{
    if(!selectedMachine||!selectedPiece)return;
    await machineAction("started",selectedPiece._id,undefined,selectedMachine.name);
    const now=new Date();
    setSession({machine:selectedMachine,piece:selectedPiece,startTime:now,elapsed:0,totalPieces:0,statut:"en_cours",events:[{type:"start",time:now}]});
    setElapsed(0);setCount(0);setIsPaused(false);setSaved(false);setStep("production");
  };

  const togglePause=async()=>{
    if(!session)return;
    const now=new Date();
    if(!isPaused){await machineAction("paused");setSession(prev=>prev?{...prev,statut:"pause",events:[...prev.events,{type:"pause",time:now}]}:prev);setIsPaused(true);}
    else{await machineAction("started",session.piece._id,undefined,session.machine.name);setSession(prev=>prev?{...prev,statut:"en_cours",events:[...prev.events,{type:"resume",time:now}]}:prev);setIsPaused(false);}
  };

  const stopSession=async()=>{
    if(!session)return;
    const endTime=new Date();
    await machineAction("stopped",session.piece._id,count);
    try{await fetch(`${BASE_URL}/api/production/sessions`,{method:"POST",headers:authHeaders,body:JSON.stringify({employee_id:username,machine_id:session.machine.id,machine_name:session.machine.name,piece_id:session.piece._id,piece_name:session.piece.nom,start_time:session.startTime,end_time:endTime,total_pieces:count,duree_secondes:elapsed,statut:"terminee",events:session.events.map(e=>({type:e.type,time:e.time,pieceCount:e.pieceCount}))})});}catch(err){console.error(err);}
    if(timerRef.current)clearInterval(timerRef.current);
    setSession(prev=>prev?{...prev,endTime,statut:"terminee",totalPieces:count,events:[...prev.events,{type:"stop",time:endTime,pieceCount:count}]}:prev);
    setSaved(true);
  };

  const changePiece=()=>{setSelectedPiece(null);setSaved(false);setSession(null);setElapsed(0);setCount(0);setIsPaused(false);setStep("pieces");};
  const resetAll=()=>{setStep("machines");setSelectedMachine(null);setSelectedPiece(null);setSession(null);setElapsed(0);setCount(0);setIsPaused(false);setSaved(false);setPieces([]);};
  const sendMessage=()=>{if(!msgText.trim())return;socketRef.current?.emit("send-direct-message",{from:username,fromRole:"employe",to:"admin",text:msgText.trim()});setMessages(prev=>[...prev,{_id:Date.now().toString(),from:username,fromRole:"employe",to:"admin",text:msgText.trim(),createdAt:new Date().toISOString()}]);setMsgText("");};

  const STEPS=[{key:"machines",label:"Machine",icon:"🏭"},{key:"pieces",label:"Pièce",icon:"⚙️"},{key:"plan",label:"Plan",icon:"📋"},{key:"production",label:"Production",icon:"▶"}];
  const stepIdx=STEPS.findIndex(s=>s.key===step);
  const progressPct=Math.min(100,Math.round((count/Math.max(1,session?.piece.quantite??1))*100));

  // ── card style helper ──
  const card = (accent="rgba(56,189,248,0.1)"): React.CSSProperties => ({ background:"rgba(10,20,35,0.85)", border:`1px solid ${accent}`, borderRadius:18, padding:24 });

  return (
    <div style={{minHeight:"100vh",background:"#060d17",color:"white",fontFamily:"'Segoe UI',system-ui,sans-serif",display:"flex",flexDirection:"column"}}>

      {/* HEADER */}
      <header style={{background:"rgba(8,16,28,0.97)",backdropFilter:"blur(12px)",borderBottom:"1px solid rgba(56,189,248,0.1)",padding:"0 28px",height:60,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#0c4a6e,#0ea5e9)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,boxShadow:"0 0 16px rgba(14,165,233,0.3)"}}>🏭</div>
          <div>
            <div style={{fontSize:14,fontWeight:800,letterSpacing:0.5}}>CNC Pulse</div>
            <div style={{fontSize:10,color:"rgba(14,165,233,0.6)",letterSpacing:2,fontWeight:600}}>ESPACE OPÉRATEUR</div>
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {(["workflow","messages"] as const).map(t=>(
            <button key={t} onClick={()=>{setTab(t);if(t==="messages")setUnread(0);}}
              style={{padding:"7px 16px",borderRadius:9,border:"1px solid",fontSize:12,fontWeight:700,cursor:"pointer",position:"relative",background:tab===t?"rgba(14,165,233,0.12)":"transparent",color:tab===t?"#38bdf8":"rgba(255,255,255,0.35)",borderColor:tab===t?"rgba(56,189,248,0.35)":"rgba(255,255,255,0.07)",transition:"all 0.15s"}}>
              {t==="workflow"?"⚡ Production":"💬 Messages"}
              {t==="messages"&&unread>0&&(<span style={{position:"absolute",top:-7,right:-7,background:"#ef4444",borderRadius:"50%",width:18,height:18,fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 8px rgba(239,68,68,0.5)"}}>{unread}</span>)}
            </button>
          ))}
          <div style={{width:1,height:22,background:"rgba(255,255,255,0.08)",margin:"0 4px"}} />
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 12px",borderRadius:8,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{width:26,height:26,borderRadius:"50%",background:"linear-gradient(135deg,#1e40af,#3b82f6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800}}>{username.charAt(0).toUpperCase()}</div>
            <span style={{fontSize:12,color:"rgba(255,255,255,0.5)",fontWeight:600}}>{username}</span>
          </div>
          <button onClick={()=>{localStorage.clear();navigate("/");}}
            style={{padding:"7px 13px",borderRadius:8,border:"1px solid rgba(239,68,68,0.25)",background:"rgba(239,68,68,0.07)",color:"#f87171",cursor:"pointer",fontSize:12,fontWeight:700}}>
            ⎋ Quitter
          </button>
        </div>
      </header>

      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {tab==="workflow"&&(
          <>
            {/* STEPPER */}
            <div style={{background:"rgba(6,13,23,0.9)",borderBottom:"1px solid rgba(56,189,248,0.07)",padding:"16px 28px"}}>
              <div style={{display:"flex",alignItems:"center",maxWidth:700}}>
                {STEPS.map((s,i)=>{
                  const done=i<stepIdx; const active=i===stepIdx;
                  return (
                    <React.Fragment key={s.key}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:done?13:12,fontWeight:800,transition:"all 0.3s",background:done?"linear-gradient(135deg,#0369a1,#0ea5e9)":active?"rgba(14,165,233,0.15)":"rgba(255,255,255,0.03)",color:done?"white":active?"#38bdf8":"rgba(255,255,255,0.18)",border:`2px solid ${done?"#0ea5e9":active?"rgba(56,189,248,0.45)":"rgba(255,255,255,0.06)"}`,boxShadow:active?"0 0 16px rgba(14,165,233,0.2)":"none"}}>
                          {done?"✓":s.icon}
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:done?"#38bdf8":active?"white":"rgba(255,255,255,0.2)",whiteSpace:"nowrap"}}>{s.label}</span>
                      </div>
                      {i<STEPS.length-1&&<div style={{flex:1,height:2,margin:"0 12px",background:i<stepIdx?"linear-gradient(90deg,#0ea5e9,rgba(14,165,233,0.3))":"rgba(255,255,255,0.05)",borderRadius:2,minWidth:20}} />}
                    </React.Fragment>
                  );
                })}
              </div>
              {selectedMachine&&(
                <div style={{marginTop:12,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"rgba(14,165,233,0.1)",color:"#38bdf8",border:"1px solid rgba(56,189,248,0.2)",fontWeight:700}}>🏭 {selectedMachine.name}</span>
                  {selectedPiece&&<span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"rgba(16,185,129,0.1)",color:"#34d399",border:"1px solid rgba(16,185,129,0.2)",fontWeight:700}}>⚙️ {selectedPiece.nom}</span>}
                  {step==="production"&&!saved&&(<button onClick={changePiece} style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"rgba(245,158,11,0.1)",color:"#fbbf24",border:"1px solid rgba(245,158,11,0.2)",fontWeight:700,cursor:"pointer"}}>⇄ Changer de pièce</button>)}
                </div>
              )}
            </div>

            <div style={{flex:1,overflowY:"auto",padding:"28px"}}>
              <div style={{maxWidth:900,margin:"0 auto"}}>

                {/* STEP 1 MACHINES */}
                {step==="machines"&&(
                  <>
                    <div style={{marginBottom:28}}>
                      <h2 style={{margin:0,fontSize:22,fontWeight:800,letterSpacing:-0.5}}>Sélectionnez votre machine</h2>
                      <p style={{margin:"6px 0 0",fontSize:13,color:"rgba(255,255,255,0.3)"}}>Choisissez la machine sur laquelle vous allez travailler</p>
                    </div>
                    {loadingM?(
                      <div style={{textAlign:"center",padding:"80px 0",color:"rgba(255,255,255,0.2)"}}>Chargement...</div>
                    ):machines.length===0?(
                      <div style={{textAlign:"center",padding:"80px 0",color:"rgba(255,255,255,0.2)"}}>Aucune machine disponible</div>
                    ):(
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:16}}>
                        {machines.map(m=>(
                          <button key={m.id} onClick={()=>{setSelectedMachine(m);fetchPieces(m.name);setStep("pieces");}}
                            style={{background:"rgba(10,20,35,0.85)",border:"1px solid rgba(56,189,248,0.1)",borderRadius:18,padding:"22px 20px",textAlign:"left",cursor:"pointer",color:"white",transition:"all 0.2s",position:"relative",overflow:"hidden"}}
                            onMouseEnter={e=>{const el=e.currentTarget;el.style.borderColor="rgba(56,189,248,0.4)";el.style.background="rgba(14,165,233,0.07)";el.style.transform="translateY(-3px)";el.style.boxShadow="0 12px 32px rgba(14,165,233,0.12)";}}
                            onMouseLeave={e=>{const el=e.currentTarget;el.style.borderColor="rgba(56,189,248,0.1)";el.style.background="rgba(10,20,35,0.85)";el.style.transform="translateY(0)";el.style.boxShadow="none";}}>
                            <div style={{position:"absolute",top:0,right:0,width:80,height:80,background:"radial-gradient(circle at top right,rgba(14,165,233,0.06),transparent)",borderRadius:"0 18px 0 0"}} />
                            <div style={{fontSize:32,marginBottom:14}}>🏭</div>
                            <div style={{fontSize:15,fontWeight:800,marginBottom:4,lineHeight:1.3}}>{m.name}</div>
                            {m.model&&<div style={{fontSize:11,color:"rgba(255,255,255,0.3)",marginBottom:2}}>{m.model}</div>}
                            {m.type&&<div style={{fontSize:11,color:"rgba(255,255,255,0.2)",marginBottom:14}}>{m.type}</div>}
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14}}>
                              {m.hasSensors?<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:"rgba(16,185,129,0.1)",color:"#34d399",border:"1px solid rgba(16,185,129,0.2)",fontWeight:700}}>● Live</span>:<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:"rgba(255,255,255,0.04)",color:"rgba(255,255,255,0.25)",border:"1px solid rgba(255,255,255,0.06)",fontWeight:600}}>Manuel</span>}
                              <span style={{fontSize:11,color:"#38bdf8",fontWeight:700}}>Choisir →</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* STEP 2 PIECES */}
                {step==="pieces"&&selectedMachine&&(
                  <>
                    <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:28}}>
                      <button onClick={()=>{setStep("machines");setSelectedMachine(null);setPieces([]);}} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"7px 14px",color:"rgba(255,255,255,0.4)",cursor:"pointer",fontSize:12,fontWeight:600}}>← Retour</button>
                      <div>
                        <h2 style={{margin:0,fontSize:22,fontWeight:800,letterSpacing:-0.5}}>Choisissez une pièce</h2>
                        <p style={{margin:"4px 0 0",fontSize:13,color:"rgba(255,255,255,0.3)"}}>Machine : <span style={{color:"#38bdf8",fontWeight:700}}>{selectedMachine.name}</span></p>
                      </div>
                    </div>
                    {loadingP?(<div style={{textAlign:"center",padding:"80px 0",color:"rgba(255,255,255,0.2)"}}>Chargement...</div>
                    ):pieces.length===0?(<div style={{textAlign:"center",padding:"80px 0"}}><div style={{fontSize:40,marginBottom:12,opacity:0.25}}>⚙️</div><div style={{color:"rgba(255,255,255,0.25)",fontSize:14}}>Aucune pièce pour {selectedMachine.name}</div></div>
                    ):(
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:16}}>
                        {pieces.map(p=>{
                          const col=SC[p.status]||"#3b82f6";
                          return(
                            <button key={p._id} onClick={()=>{setSelectedPiece(p);setStep("plan");}}
                              style={{background:"rgba(10,20,35,0.85)",border:`1px solid rgba(56,189,248,0.08)`,borderLeft:`3px solid ${col}`,borderRadius:16,padding:"20px",textAlign:"left",cursor:"pointer",color:"white",transition:"all 0.2s"}}
                              onMouseEnter={e=>{const el=e.currentTarget;el.style.background="rgba(14,165,233,0.05)";el.style.transform="translateY(-2px)";el.style.boxShadow="0 8px 24px rgba(0,0,0,0.2)";}}
                              onMouseLeave={e=>{const el=e.currentTarget;el.style.background="rgba(10,20,35,0.85)";el.style.transform="translateY(0)";el.style.boxShadow="none";}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                                <span style={{fontSize:28}}>⚙️</span>
                                <span style={{fontSize:10,padding:"3px 9px",borderRadius:20,fontWeight:800,background:`${col}18`,color:col,border:`1px solid ${col}35`}}>{p.status}</span>
                              </div>
                              <div style={{fontSize:15,fontWeight:800,marginBottom:14,lineHeight:1.3}}>{p.nom}</div>
                              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                                <div style={{background:"rgba(59,130,246,0.07)",borderRadius:10,padding:"10px",textAlign:"center",border:"1px solid rgba(59,130,246,0.12)"}}>
                                  <div style={{fontSize:20,fontWeight:800,color:"#3b82f6"}}>{p.quantite}</div>
                                  <div style={{fontSize:10,color:"rgba(255,255,255,0.25)",marginTop:2}}>pcs requises</div>
                                </div>
                                <div style={{background:"rgba(16,185,129,0.07)",borderRadius:10,padding:"10px",textAlign:"center",border:"1px solid rgba(16,185,129,0.12)"}}>
                                  <div style={{fontSize:16,fontWeight:800,color:"#10b981"}}>{p.prix} DT</div>
                                  <div style={{fontSize:10,color:"rgba(255,255,255,0.25)",marginTop:2}}>prix/unité</div>
                                </div>
                              </div>
                              {!p.matiere&&<div style={{fontSize:11,color:"#ef4444",padding:"5px 10px",background:"rgba(239,68,68,0.07)",borderRadius:7,marginBottom:6,fontWeight:600}}>⚠️ Matière manquante</div>}
                              <div style={{fontSize:11,color:"#38bdf8",fontWeight:700,marginTop:6}}>Voir le plan →</div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                {/* STEP 3 PLAN */}
                {step==="plan"&&selectedPiece&&selectedMachine&&(
                  <>
                    <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:28}}>
                      <button onClick={()=>{setSelectedPiece(null);setStep("pieces");}} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"7px 14px",color:"rgba(255,255,255,0.4)",cursor:"pointer",fontSize:12,fontWeight:600}}>← Retour</button>
                      <div>
                        <h2 style={{margin:0,fontSize:22,fontWeight:800,letterSpacing:-0.5}}>Plan de fabrication</h2>
                        <p style={{margin:"4px 0 0",fontSize:13,color:"rgba(255,255,255,0.3)"}}>{selectedMachine.name} · <span style={{color:"#38bdf8",fontWeight:700}}>{selectedPiece.nom}</span></p>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:18}}>
                      <div style={card()}>
                        <div style={{fontSize:10,color:"rgba(56,189,248,0.5)",marginBottom:18,fontWeight:800,letterSpacing:2}}>FICHE PIÈCE</div>
                        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:22,padding:"14px",background:"rgba(14,165,233,0.05)",borderRadius:12,border:"1px solid rgba(56,189,248,0.08)"}}>
                          <div style={{width:52,height:52,borderRadius:13,background:"rgba(14,165,233,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,border:"1px solid rgba(56,189,248,0.12)"}}>⚙️</div>
                          <div><div style={{fontSize:16,fontWeight:800,lineHeight:1.2}}>{selectedPiece.nom}</div><div style={{fontSize:11,color:"rgba(255,255,255,0.3)",marginTop:3}}>{selectedMachine.name}</div></div>
                        </div>
                        {[{label:"Quantité requise",value:`${selectedPiece.quantite} pcs`,color:"#3b82f6"},{label:"Prix unitaire",value:`${selectedPiece.prix} DT`,color:"#10b981"},{label:"Valeur totale",value:`${(selectedPiece.quantite*selectedPiece.prix).toLocaleString()} DT`,color:"#f59e0b"},{label:"Matière",value:selectedPiece.matiere?"✅ Disponible":"⚠️ Manquante",color:selectedPiece.matiere?"#10b981":"#ef4444"},{label:"Statut",value:selectedPiece.status,color:SC[selectedPiece.status]||"#3b82f6"}].map(row=>(
                          <div key={row.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                            <span style={{fontSize:12,color:"rgba(255,255,255,0.3)",fontWeight:500}}>{row.label}</span>
                            <span style={{fontSize:13,fontWeight:800,color:row.color}}>{row.value}</span>
                          </div>
                        ))}
                      </div>
                      <div style={card()}>
                        <div style={{fontSize:10,color:"rgba(56,189,248,0.5)",marginBottom:18,fontWeight:800,letterSpacing:2}}>INSTRUCTIONS</div>
                        {!selectedPiece.taches||selectedPiece.taches.length===0?(
                          <div style={{textAlign:"center",padding:"50px 0",color:"rgba(255,255,255,0.18)"}}><div style={{fontSize:32,marginBottom:10}}>📋</div><div style={{fontSize:13}}>Aucune instruction définie</div></div>
                        ):(
                          <div style={{display:"flex",flexDirection:"column",gap:10}}>
                            {selectedPiece.taches.map((t,i)=>{
                              const pc:Record<string,string>={haute:"#ef4444",moyenne:"#f59e0b",basse:"#10b981"};
                              const c=t.priorite?pc[t.priorite]||"#3b82f6":"#3b82f6";
                              return(<div key={t._id} style={{background:"rgba(255,255,255,0.025)",borderRadius:11,padding:"12px 14px",border:"1px solid rgba(255,255,255,0.05)"}}>
                                <div style={{display:"flex",alignItems:"center",gap:10}}>
                                  <span style={{width:22,height:22,borderRadius:"50%",background:"rgba(14,165,233,0.12)",border:"1px solid rgba(56,189,248,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#38bdf8",flexShrink:0}}>{i+1}</span>
                                  <span style={{fontSize:13,fontWeight:700,flex:1}}>{t.titre}</span>
                                  {t.priorite&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:5,background:`${c}18`,color:c,fontWeight:800,border:`1px solid ${c}30`}}>{t.priorite}</span>}
                                </div>
                                {t.description&&<div style={{fontSize:11,color:"rgba(255,255,255,0.3)",marginTop:6,marginLeft:32}}>{t.description}</div>}
                              </div>);
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    {!selectedPiece.matiere?(
                      <div style={{background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:14,padding:"18px 22px",textAlign:"center"}}>
                        <div style={{fontSize:16,fontWeight:800,color:"#f87171",marginBottom:6}}>⚠️ Matière première manquante</div>
                        <div style={{fontSize:13,color:"rgba(255,255,255,0.3)"}}>La production ne peut pas démarrer sans matière disponible.</div>
                      </div>
                    ):(
                      <button onClick={startSession}
                        style={{width:"100%",padding:"17px",borderRadius:14,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#0369a1,#0ea5e9)",color:"white",fontSize:15,fontWeight:800,letterSpacing:0.5,boxShadow:"0 8px 24px rgba(14,165,233,0.25)",transition:"all 0.2s"}}
                        onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 12px 32px rgba(14,165,233,0.35)";}}
                        onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 8px 24px rgba(14,165,233,0.25)";}}>
                        ▶ Démarrer la production
                      </button>
                    )}
                  </>
                )}

                {/* STEP 4 PRODUCTION */}
                {step==="production"&&session&&(
                  <>
                    <div style={{background:saved?"rgba(16,185,129,0.06)":isPaused?"rgba(245,158,11,0.06)":"rgba(14,165,233,0.06)",border:`1px solid ${saved?"rgba(16,185,129,0.2)":isPaused?"rgba(245,158,11,0.2)":"rgba(56,189,248,0.2)"}`,borderRadius:16,padding:"18px 22px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:14}}>
                      <div>
                        <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",letterSpacing:2,fontWeight:700,marginBottom:4}}>SESSION DE PRODUCTION</div>
                        <div style={{fontSize:18,fontWeight:800,letterSpacing:-0.3}}>{session.piece.nom}</div>
                        <div style={{fontSize:12,color:"rgba(255,255,255,0.3)",marginTop:3}}>🏭 {session.machine.name}</div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
                        <span style={{padding:"6px 16px",borderRadius:20,fontSize:12,fontWeight:800,background:saved?"rgba(16,185,129,0.12)":isPaused?"rgba(245,158,11,0.12)":"rgba(14,165,233,0.12)",color:saved?"#34d399":isPaused?"#fbbf24":"#38bdf8",border:`1px solid ${saved?"rgba(16,185,129,0.25)":isPaused?"rgba(245,158,11,0.25)":"rgba(56,189,248,0.25)"}`}}>
                          {saved?"✅ Terminée":isPaused?"⏸ En pause":"● En cours"}
                        </span>
                        <span style={{fontSize:11,color:"rgba(255,255,255,0.2)"}}>Démarré à {session.startTime.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</span>
                      </div>
                    </div>

                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:20}}>
                      <div style={card()}>
                        <div style={{fontSize:10,color:"rgba(56,189,248,0.45)",letterSpacing:2,fontWeight:700,marginBottom:12,textAlign:"center"}}>TEMPS ÉCOULÉ</div>
                        <div style={{fontSize:32,fontWeight:900,color:"#38bdf8",fontFamily:"monospace",letterSpacing:2,lineHeight:1,textAlign:"center"}}>{fmt(elapsed)}</div>
                      </div>
                      <div style={card()}>
                        <div style={{fontSize:10,color:"rgba(56,189,248,0.45)",letterSpacing:2,fontWeight:700,marginBottom:10,textAlign:"center"}}>PIÈCES PRODUITES</div>
                        <div style={{fontSize:38,fontWeight:900,color:"#34d399",marginBottom:12,lineHeight:1,textAlign:"center"}}>{count}</div>
                        <div style={{display:"flex",gap:8,justifyContent:"center",alignItems:"center"}}>
                          <button aria-label="Diminuer" onClick={()=>setCount(p=>Math.max(0,p-1))} disabled={saved||count===0} style={{width:34,height:34,borderRadius:9,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.04)",color:"white",cursor:saved?"not-allowed":"pointer",fontSize:20,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",opacity:(saved||count===0)?0.3:1}}>−</button>
                          <input type="number" min={0} value={count} aria-label="Nombre de pièces" onChange={e=>setCount(Math.max(0,parseInt(e.target.value)||0))} disabled={saved} style={{width:64,textAlign:"center",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(56,189,248,0.2)",borderRadius:9,color:"white",fontSize:18,fontWeight:800,outline:"none",padding:"6px 0"}} />
                          <button aria-label="Augmenter" onClick={()=>setCount(p=>p+1)} disabled={saved} style={{width:34,height:34,borderRadius:9,border:"1px solid rgba(56,189,248,0.3)",background:"rgba(14,165,233,0.1)",color:"#38bdf8",cursor:saved?"not-allowed":"pointer",fontSize:20,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",opacity:saved?0.3:1}}>+</button>
                        </div>
                      </div>
                      <div style={card()}>
                        <div style={{fontSize:10,color:"rgba(56,189,248,0.45)",letterSpacing:2,fontWeight:700,marginBottom:12,textAlign:"center"}}>TAUX / HEURE</div>
                        <div style={{fontSize:32,fontWeight:900,color:"#fbbf24",lineHeight:1,marginBottom:4,textAlign:"center"}}>{elapsed>0?Math.round((count/elapsed)*3600):0}</div>
                        <div style={{fontSize:10,color:"rgba(255,255,255,0.2)",marginBottom:14,textAlign:"center"}}>pcs/heure</div>
                        <div style={{height:6,background:"rgba(255,255,255,0.06)",borderRadius:3,overflow:"hidden",marginBottom:6}}><div style={{height:"100%",borderRadius:3,background:progressPct>=100?"#34d399":"linear-gradient(90deg,#0ea5e9,#38bdf8)",width:`${progressPct}%`,transition:"width 0.5s"}} /></div>
                        <div style={{fontSize:10,color:"rgba(255,255,255,0.2)",textAlign:"center"}}>{progressPct}% de l'objectif ({session.piece.quantite} pcs)</div>
                      </div>
                    </div>

                    {!saved?(
                      <div style={{display:"flex",gap:14}}>
                        <button onClick={togglePause} style={{flex:1,padding:"15px",borderRadius:13,border:"none",cursor:"pointer",fontWeight:800,fontSize:14,letterSpacing:0.3,background:isPaused?"linear-gradient(135deg,#0369a1,#0ea5e9)":"linear-gradient(135deg,#78350f,#d97706)",color:"white",boxShadow:isPaused?"0 6px 20px rgba(14,165,233,0.2)":"0 6px 20px rgba(217,119,6,0.2)",transition:"all 0.2s"}}>
                          {isPaused?"▶ Reprendre la production":"⏸ Mettre en pause"}
                        </button>
                        <button onClick={stopSession} style={{flex:1,padding:"15px",borderRadius:13,border:"none",cursor:"pointer",fontWeight:800,fontSize:14,letterSpacing:0.3,background:"linear-gradient(135deg,#7f1d1d,#ef4444)",color:"white",boxShadow:"0 6px 20px rgba(239,68,68,0.2)",transition:"all 0.2s"}}>
                          ⏹ Arrêter et enregistrer
                        </button>
                      </div>
                    ):(
                      <>
                        <div style={{background:"rgba(16,185,129,0.05)",border:"1px solid rgba(16,185,129,0.15)",borderRadius:16,padding:22,marginBottom:16}}>
                          <div style={{fontSize:14,fontWeight:800,color:"#34d399",marginBottom:18}}>✅ Session enregistrée avec succès</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                            {[{label:"Pièce",value:session.piece.nom},{label:"Machine",value:session.machine.name},{label:"Durée",value:fmt(elapsed)},{label:"Pièces",value:`${count} pcs`},{label:"Taux moyen",value:`${elapsed>0?Math.round((count/elapsed)*3600):0} pcs/h`},{label:"Valeur",value:`${(count*session.piece.prix).toLocaleString()} DT`}].map(r=>(
                              <div key={r.label} style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"11px 14px",border:"1px solid rgba(255,255,255,0.05)"}}>
                                <div style={{fontSize:10,color:"rgba(255,255,255,0.25)",marginBottom:3,fontWeight:600}}>{r.label}</div>
                                <div style={{fontSize:14,fontWeight:800}}>{r.value}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div style={{display:"flex",gap:14}}>
                          <button onClick={changePiece} style={{flex:1,padding:"14px",borderRadius:13,border:"none",cursor:"pointer",fontWeight:800,fontSize:13,background:"linear-gradient(135deg,#0369a1,#0ea5e9)",color:"white",boxShadow:"0 6px 20px rgba(14,165,233,0.2)"}}>⚙️ Produire une autre pièce</button>
                          <button onClick={resetAll} style={{flex:1,padding:"14px",borderRadius:13,border:"1px solid rgba(255,255,255,0.08)",cursor:"pointer",fontWeight:800,fontSize:13,background:"rgba(255,255,255,0.04)",color:"rgba(255,255,255,0.5)"}}>🏭 Changer de machine</button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* MESSAGES */}
        {tab==="messages"&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",maxWidth:760,margin:"0 auto",width:"100%",padding:"20px 28px"}}>
            <div style={{background:"rgba(8,16,28,0.97)",borderRadius:"16px 16px 0 0",border:"1px solid rgba(56,189,248,0.1)",borderBottom:"none",padding:"14px 20px",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:38,height:38,borderRadius:"50%",background:"linear-gradient(135deg,#0369a1,#0ea5e9)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,boxShadow:"0 0 12px rgba(14,165,233,0.3)"}}>A</div>
              <div><div style={{fontSize:14,fontWeight:800}}>Administrateur</div><div style={{fontSize:11,color:"#34d399",fontWeight:600}}>● En ligne</div></div>
            </div>
            <div style={{flex:1,overflowY:"auto",background:"rgba(4,10,18,0.95)",border:"1px solid rgba(56,189,248,0.07)",borderTop:"none",borderBottom:"none",padding:"16px",minHeight:300,maxHeight:"calc(100vh - 280px)"}}>
              {messages.length===0?(
                <div style={{textAlign:"center",color:"rgba(255,255,255,0.15)",padding:"80px 0"}}><div style={{fontSize:36,marginBottom:12}}>💬</div><div style={{fontSize:14}}>Démarrez la conversation avec l'administrateur</div></div>
              ):messages.map((msg,i)=>{
                const isMe=msg.from===username;
                return(<div key={i} style={{display:"flex",justifyContent:isMe?"flex-end":"flex-start",marginBottom:12,gap:8,alignItems:"flex-end"}}>
                  {!isMe&&<div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#0369a1,#0ea5e9)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,flexShrink:0}}>A</div>}
                  <div style={{maxWidth:"65%",display:"flex",flexDirection:"column",alignItems:isMe?"flex-end":"flex-start"}}>
                    <div style={{padding:"10px 15px",borderRadius:isMe?"16px 16px 4px 16px":"16px 16px 16px 4px",background:isMe?"linear-gradient(135deg,#1e40af,#2563eb)":"rgba(14,25,40,0.9)",fontSize:13,lineHeight:1.5,border:isMe?"none":"1px solid rgba(56,189,248,0.08)",boxShadow:isMe?"0 4px 12px rgba(37,99,235,0.2)":"none"}}>{msg.text}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,0.15)",marginTop:3}}>{new Date(msg.createdAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</div>
                  </div>
                  {isMe&&<div style={{width:28,height:28,borderRadius:"50%",background:"rgba(37,99,235,0.3)",border:"1px solid rgba(59,130,246,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,flexShrink:0}}>{username.charAt(0).toUpperCase()}</div>}
                </div>);
              })}
              <div ref={msgEndRef} />
            </div>
            <div style={{display:"flex",gap:10,padding:"13px 16px",background:"rgba(8,16,28,0.97)",borderRadius:"0 0 16px 16px",border:"1px solid rgba(56,189,248,0.1)",borderTop:"1px solid rgba(56,189,248,0.07)"}}>
              <input value={msgText} onChange={e=>setMsgText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMessage()} placeholder="Écrire un message à l'administrateur..." aria-label="Message à envoyer"
                style={{flex:1,background:"rgba(4,10,18,0.8)",border:"1px solid rgba(56,189,248,0.12)",borderRadius:24,padding:"10px 18px",color:"white",fontSize:13,outline:"none",transition:"border-color 0.15s"}}
                onFocus={e=>e.target.style.borderColor="rgba(56,189,248,0.35)"} onBlur={e=>e.target.style.borderColor="rgba(56,189,248,0.12)"} />
              <button onClick={sendMessage} aria-label="Envoyer"
                style={{width:42,height:42,borderRadius:"50%",background:"linear-gradient(135deg,#0369a1,#0ea5e9)",color:"white",border:"none",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 4px 12px rgba(14,165,233,0.3)",transition:"all 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.05)";e.currentTarget.style.boxShadow="0 6px 18px rgba(14,165,233,0.4)";}}
                onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="0 4px 12px rgba(14,165,233,0.3)";}}>➤</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployePage;