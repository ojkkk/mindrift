// @ts-nocheck
import type { SessionMeta, Turn, ToolCall, PlanStep, ParsedSession, SessionInfo, Stats } from "../shared/types";


const express=require("express"),{createServer}=require("http"),{WebSocketServer}=require("ws"),chokidar=require("chokidar"),cors=require("cors"),fs=require("fs"),path=require("path"),os=require("os");
const PORT=3344,CODEX_SESSIONS=path.join(os.homedir(),".codex","sessions"),CLIENT_DIST=path.join(__dirname,"..","client","dist");

let sessionMeta=null,turns=[],toolCalls=[],planSteps=[],tokenMetrics={total:{input_tokens:0,cached_input_tokens:0,output_tokens:0,reasoning_output_tokens:0,total_tokens:0},contextWindow:0},currentSessionFile=null,currentWatcher=null,allSessionsCache=[];

function safeJson(s){try{return JSON.parse(s)}catch{return null}}

function isSystemMsg(t){
  if(!t||!t.trim())return true;
  const s=t.trim();
  if(s.startsWith("# AGENTS.md")||s.startsWith("# RTK")||s.includes("RTK (Rust Token Killer)")||s.includes("Rust Token Killer"))return true;
  if(s.startsWith("<codex_internal_context")||s.startsWith("<turn_aborted>"))return true;
  if(s.startsWith("<INSTRUCTIONS>")||s.startsWith("<!-- headroom"))return true;
  if(s.startsWith("Continue working toward")||s.startsWith("The objective below")||s.startsWith("Continue working on"))return true;
  if(/^Continue working/i.test(s))return true;
  if(s.includes("Token-Optimized Commands")||s.includes("--- project-doc ---"))return true;
  if(s.startsWith("When running shell")||s.startsWith("In command chains")||s.startsWith("For debugging"))return true;
  if(s.startsWith("<environment_context>")||s.startsWith("<filesystem>")||s.startsWith("<app-context>"))return true;
  if(s.startsWith("<collaboration_mode>")||s.startsWith("<permissions")||s.startsWith("<skills_instructions>"))return true;
  if(s.startsWith("<plugins_instructions>")||s.startsWith("Sandbox mode")||s.startsWith("Approval policy"))return true;
  if(s.startsWith("<current_date>")||s.startsWith("<timezone>"))return true;
  if(/^[A-Za-z]:\\/.test(s)&&s.length<60&&!s.includes(" "))return true;
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return true;
  if(s==="powershell"||s==="bash"||s==="cmd")return true;
  if(/^Asia\/\w+$/.test(s))return true;
  if(s.includes("AGENTS.md instructions")||s.includes("prefixed with `rtk`"))return true;
  if(/^\*\*/.test(s)&&(s.includes("savings")||s.includes("Token-Optimized")))return true;
  return false;
}

function extractFirstLine(text){
  if(!text)return"";
  const lines=text.split(/\n/).map(l=>l.trim()).filter(l=>l&&!isSystemMsg(l));
  return lines.length>0?lines[0].slice(0,80):"";
}

function extractSessionName(turns){
  for(const t of turns){if(t.userMsg&&!t.userMsg.startsWith("[Goal]")&&t.userMsg.length>3)return t.userMsg.slice(0,80);}
  for(const t of turns){if(t.userMsg&&t.userMsg.length>3)return t.userMsg.slice(0,80);}
  for(const t of turns){if(t.agentSummary&&t.agentSummary.length>3)return t.agentSummary.slice(0,80);}
  return"";
}

// ===== MAIN PARSER =====
function parseSession(raw){
  const R={meta:null,turns:[],toolCalls:[],planSteps:[],tokenTotal:{input_tokens:0,cached_input_tokens:0,output_tokens:0,reasoning_output_tokens:0,total_tokens:0},ctxWindow:0};
  let tn=0;const seenTurnIds=new Set();let lastCompactedMsg=null;
  const lines=raw.split("\n");

  for(const line of lines){
    if(!line.trim())continue;const evt=safeJson(line);if(!evt)continue;const{type,payload,timestamp}=evt;

    // session_meta
    if(type==="session_meta"){
      R.meta={id:payload.id,cwd:payload.cwd,model:payload.model_provider||"custom",cliVersion:payload.cli_version,startedAt:payload.timestamp};
    }
    // compacted
    else if(type==="compacted"){
      lastCompactedMsg=(payload.message||"").slice(0,500);
      if(R.turns[tn-1]){R.turns[tn-1].compacted=true;R.turns[tn-1].compactSummary=lastCompactedMsg}
    }
    // turn_context
    else if(type==="turn_context"){
      const tid=payload.turn_id;
      if(seenTurnIds.has(tid)){const ex=R.turns.find(t=>t.id===tid);if(ex)ex.compactRestarts=(ex.compactRestarts||0)+1;continue}
      seenTurnIds.add(tid);tn++;
      R.turns.push({id:tid,n:tn,model:payload.model||R.meta?.model||"?",startedAt:timestamp,finishedAt:null,tc:0,tokens:{in:0,out:0,reason:0},ctxWindow:0,userMsg:"",agentMessages:[],agentSummary:"",reasoning:"",duration:null,compacted:false,compactRestarts:0,compactSummary:lastCompactedMsg||"",goalObjective:"",aborted:false,abortReason:"",taskDone:false,wastedTokens:0,wasteReasons:[]});
      lastCompactedMsg=null;
    }
    // event_msg — messages, token counts, task events
    else if(type==="event_msg"){
      const cur=R.turns[tn-1];if(!cur)continue;const pt=payload.type;
      if(pt==="user_message"){const m=extractFirstLine(payload.message||"");if(m)cur.userMsg=m.slice(0,200)}
      else if(pt==="agent_reasoning"){cur.reasoning=((cur.reasoning||"")+(payload.text||"")+"\n").slice(0,80000)}
      else if(pt==="agent_message"){if(payload.message){const t=payload.message.trim();if(t){cur.agentMessages.push({ts:timestamp,text:t.slice(0,500)});if(!cur.agentSummary)cur.agentSummary=t.slice(0,200)}}}
      else if(pt==="token_count"&&payload.info){
        R.tokenTotal=payload.info.total_token_usage||R.tokenTotal;R.ctxWindow=payload.info.model_context_window||R.ctxWindow;
        if(cur){
          const prevIn=R.turns.slice(0,tn-1).reduce((s,t)=>s+(t.tokens?.in||0),0);
          const prevOut=R.turns.slice(0,tn-1).reduce((s,t)=>s+(t.tokens?.out||0),0);
          const prevReason=R.turns.slice(0,tn-1).reduce((s,t)=>s+(t.tokens?.reason||0),0);
          cur.tokens={in:(R.tokenTotal.input_tokens||0)-prevIn,out:(R.tokenTotal.output_tokens||0)-prevOut,reason:(R.tokenTotal.reasoning_output_tokens||0)-prevReason};
          cur.ctxWindow=R.ctxWindow;
        }
      }
      else if(pt==="context_compacted"){cur.compacted=true;cur.compactRestarts=(cur.compactRestarts||0)+1}
      else if(pt==="task_started"){cur.startedAt=timestamp;cur.ctxWindow=payload.model_context_window||R.ctxWindow}
      else if(pt==="task_complete"){cur.finishedAt=timestamp;cur.taskDone=true}
      else if(pt==="turn_aborted"){
        const at=R.turns.find(t=>t.id===payload.turn_id);
        if(at){at.aborted=true;at.abortReason=payload.reason||"interrupted";at.finishedAt=timestamp;at.taskDone=true;
          if(at.startedAt)at.duration=Math.round((new Date(timestamp).getTime()-new Date(at.startedAt).getTime())/1000)}
      }
      else if(pt==="thread_goal_updated"&&payload.goal?.objective){
        if(!cur.userMsg){cur.userMsg="[Goal] "+payload.goal.objective.slice(0,180);cur.goalObjective=payload.goal.objective.slice(0,500)}
      }
      // MCP tool call end
      else if(pt==="mcp_tool_call_end"){
        const tid=payload.call_id;const tc=R.toolCalls.find(c=>c.id===tid);
        if(tc){
          tc.done=true;tc.dur=timestamp?new Date(timestamp).getTime()-new Date(tc.ts).getTime():0;
          const inv=payload.invocation;
          if(inv){tc.name=inv.tool||inv.server||tc.name;tc.argsFull=JSON.stringify(inv.arguments||{});tc.args=tc.argsFull.slice(0,200)}
          if(tn>0&&R.turns[tn-1])R.turns[tn-1].tc=(R.turns[tn-1].tc||0)+1;
        }
      }
    }
    // response_item — tool calls & plan updates (THE MAIN SOURCE)
    else if(type==="response_item"){
      const pt=payload.type;
      if(pt==="function_call"){
        const name=payload.name||"unknown";
        const callId=payload.call_id||(Math.random().toString(36).slice(2));
        // Plan update
        if(name==="update_plan"){
          try{
            const args=typeof payload.arguments==="string"?JSON.parse(payload.arguments):payload.arguments;
            if(args.plan&&Array.isArray(args.plan)){
              R.planSteps=args.plan.map(p=>({step:p.step,status:p.status||"pending"}));
            }
          }catch{}
        }
        // Regular tool call
        const tc={
          id:callId,name:name,ts:timestamp,dur:0,done:false,
          args:"",argsFull:"",output:"",outputFull:"",error:"",turnN:tn,readFiles:[]
        };
        if(payload.arguments){
          const raw=typeof payload.arguments==="string"?payload.arguments:JSON.stringify(payload.arguments);
          try{const a=JSON.parse(raw);tc.args=JSON.stringify(a).slice(0,200);tc.argsFull=JSON.stringify(a).slice(0,5000)}catch{tc.args=raw.slice(0,200);tc.argsFull=raw.slice(0,5000)}
        }
        R.toolCalls.push(tc);
        if(tn>0&&R.turns[tn-1])R.turns[tn-1].tc=(R.turns[tn-1].tc||0)+1;
      }
      else if(pt==="function_call_output"){
        const tid=payload.call_id;const tc=R.toolCalls.find(c=>c.id===tid);
        if(tc){
          tc.done=true;tc.dur=timestamp?new Date(timestamp).getTime()-new Date(tc.ts).getTime():0;
          const out=payload.output||"";const os=typeof out==="string"?out:JSON.stringify(out);
          tc.output=os.slice(0,300);tc.outputFull=os.slice(0,10000);tc.outputSize=os.length;
          if(typeof out==="string"&&/error|failed|exception/i.test(out.slice(0,200)))tc.error=out.slice(0,200);
        }
      }
    }
  }

  // Post-process: set finishedAt for turns followed by another turn
  for(let i=0;i<R.turns.length;i++){
    const t=R.turns[i];
    if(!t.finishedAt&&i<R.turns.length-1){t.finishedAt=R.turns[i+1].startedAt}
    if(t.startedAt&&t.finishedAt&&!t.duration){
      t.duration=Math.round((new Date(t.finishedAt).getTime()-new Date(t.startedAt).getTime())/1000);
    }
    if(!t.userMsg&&t.goalObjective){t.userMsg="[Goal] "+t.goalObjective.slice(0,180)}
    if(!t.userMsg){
      for(let j=i-1;j>=0;j--){
        if(R.turns[j].goalObjective&&R.turns[j].userMsg&&R.turns[j].userMsg.startsWith("[Goal]")){
          t.userMsg="[Goal] "+R.turns[j].goalObjective.slice(0,160);
          t.goalObjective=R.turns[j].goalObjective;break;
        }
      }
    }
  }

  if(!R.meta)R.meta={id:"unknown",cwd:"",model:"?",startedAt:new Date().toISOString()};
  R.meta.sessionName=extractSessionName(R.turns)||R.meta.cwd||"";
  return R;
}

// ===== Session scanning =====
function scanAllSessions(){
  const sessions=[];
  function walkDir(dir,limit=500){
    if(sessions.length>=limit)return;
    try{
      for(const e of fs.readdirSync(dir,{withFileTypes:true})){
        if(sessions.length>=limit)return;
        if(e.isDirectory()){walkDir(path.join(dir,e.name),limit)}
        else if(e.name.endsWith(".jsonl")){
          const fp=path.join(dir,e.name);
          try{
            const raw=fs.readFileSync(fp,"utf-8");if(raw.length<100)continue;
            const p=parseSession(raw);if(!p||!p.turns||p.turns.length===0)continue;
            const stat=fs.statSync(fp);
            const anomalies=[];
            const totalToks=p.tokenTotal?.total_tokens||0;
            if(totalToks>500000)anomalies.push("high-tokens");
            if(p.toolCalls.length>100)anomalies.push("many-tools");
            if(totalToks>0&&p.ctxWindow>0&&totalToks/p.turns.length>p.ctxWindow*0.7)anomalies.push("context-pressure");
            const failedTools=p.toolCalls.filter(tc=>tc.error).length;
            if(failedTools>5)anomalies.push("tool-errors");
            const name=p.meta?.sessionName||p.turns[0]?.userMsg||p.meta?.cwd?.split(/[\\/]/).pop()||fp.split("\\").pop()?.replace(".jsonl","")||"";
            sessions.push({
              id:p.meta?.id||fp.split("\\").pop()?.replace(".jsonl","")||"",
              name:name.slice(0,80),
              startedAt:p.meta?.startedAt||p.turns[0]?.startedAt||stat.birthtime.toISOString(),
              cwd:p.meta?.cwd||"",model:p.meta?.model||"?",
              turnCount:p.turns.length,totalTokens:totalToks,
              duration:p.turns[p.turns.length-1]?.duration||0,
              toolCallCount:p.toolCalls.length,failedToolCalls:failedTools,
              compactCount:p.turns.filter(t=>t.compacted).length,
              anomalies,filePath:fp,size:stat.size,
              mtime:stat.mtime.toISOString(),latestEventTs:stat.mtime.toISOString()
            });
          }catch{continue}
        }
      }
    }catch{}
  }
  try{
    const years=fs.readdirSync(CODEX_SESSIONS,{withFileTypes:true}).filter(e=>e.isDirectory());
    for(const y of years){
      try{
        const months=fs.readdirSync(path.join(CODEX_SESSIONS,y.name),{withFileTypes:true}).filter(e=>e.isDirectory());
        for(const m of months){walkDir(path.join(CODEX_SESSIONS,y.name,m.name))}
      }catch{}
    }
  }catch{}
  sessions.sort((a,b)=>new Date(b.latestEventTs).getTime()-new Date(a.latestEventTs).getTime());
  allSessionsCache=sessions;
  return sessions;
}

function computeStats(sessions){
  const now=new Date();const todayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1).getTime();
  let todayTokens=0,todaySessions=0,monthTokens=0,monthSessions=0,totalAllTokens=0,totalAllTurns=0;
  for(const s of sessions){
    const started=new Date(s.startedAt).getTime();const latest=new Date(s.latestEventTs||s.startedAt).getTime();
    totalAllTokens+=s.totalTokens||0;totalAllTurns+=s.turnCount||0;
    if(started>=todayStart||latest>=todayStart){todayTokens+=s.totalTokens||0;todaySessions++}
    if(started>=monthStart||latest>=monthStart){monthTokens+=s.totalTokens||0;monthSessions++}
  }
  return{
    today:{tokens:todayTokens,sessions:todaySessions},
    month:{tokens:monthTokens,sessions:monthSessions},
    all:{tokens:totalAllTokens,turns:totalAllTurns,sessions:sessions.length},
    anomalies:sessions.filter(s=>s.anomalies&&s.anomalies.length>0).length
  };
}

function loadSession(p){try{return parseSession(fs.readFileSync(p,"utf-8"))}catch{return null}}

function switchToSession(fp){
  if(currentWatcher){try{currentWatcher.close()}catch{}}currentWatcher=null;currentSessionFile=fp;
  const p=loadSession(fp);if(!p)return;
  sessionMeta=p.meta;turns=p.turns;toolCalls=p.toolCalls;planSteps=p.planSteps;
  tokenMetrics={total:p.tokenTotal,contextWindow:p.ctxWindow};broadcastFullState();
  let ls=fs.statSync(fp).size;
  const w=chokidar.watch(fp,{persistent:true,usePolling:true,interval:300});
  w.on("change",()=>{
    try{
      const cur=fs.statSync(fp).size;if(cur<=ls){ls=cur;return}
      const raw=fs.readFileSync(fp,"utf-8");ls=cur;
      const p=parseSession(raw);if(!p||!p.turns)return;
      if(p.meta)sessionMeta=p.meta;
      turns=p.turns;toolCalls=p.toolCalls;planSteps=p.planSteps;
      tokenMetrics={total:p.tokenTotal,contextWindow:p.ctxWindow};broadcastFullState();
    }catch(e){console.error("watch error:",e.message)}
  });
  currentWatcher=w;console.log("watching:",fp.split("\\").pop(),turns.length,"turns");
}

function buildClientTurns(){
  return turns.map(t=>({...t,tTools:toolCalls.filter(tc=>tc.turnN===t.n).map(c=>({id:c.id,name:c.name,ts:c.ts,dur:c.dur,done:c.done,args:c.args,argsFull:c.argsFull,output:c.output,outputFull:c.outputFull,error:c.error,outputSize:c.outputSize,readFiles:c.readFiles}))}));
}

function buildClientTools(){return toolCalls.map(c=>({id:c.id,name:c.name,ts:c.ts,dur:c.dur,done:c.done,args:c.args,argsFull:c.argsFull,output:c.output,outputFull:c.outputFull,turnN:c.turnN,error:c.error}))}

function broadcastFullState(){broadcast("full_state",{meta:sessionMeta,turns:buildClientTurns(),planSteps,toolCalls:buildClientTools(),stats:computeStats(scanAllSessions())})}

// ===== Express + WS =====
const app=express();app.use(cors());
app.get("/api/sessions",(_,r)=>{const s=scanAllSessions();r.json({sessions:s,stats:computeStats(s)})});
app.get("/api/sessions/:id",(req,res)=>{
  const ss=scanAllSessions(),s=ss.find(x=>x.id===req.params.id||x.id.startsWith(req.params.id));
  if(!s)return res.status(404).json({error:"not found"});
  res.json({session:s,...loadSession(s.filePath)});
});
app.get("/api/sessions/:id/raw",(req,res)=>{
  const ss=scanAllSessions(),s=ss.find(x=>x.id===req.params.id||x.id.startsWith(req.params.id));
  if(!s)return res.status(404).json({error:"not found"});
  try{res.type("text/plain").send(fs.readFileSync(s.filePath,"utf-8"))}catch(e){res.status(500).json({error:e.message})}
});
app.get("/api/stats",(_,r)=>{r.json(computeStats(scanAllSessions()))});
app.get("/api/status",(_,r)=>r.json({ok:true,turns:turns.length,toolCalls:toolCalls.length,currentFile:currentSessionFile,uptime:Math.floor(process.uptime())}));
app.use(express.static(CLIENT_DIST));
app.get("*",(req,res)=>{const fp=path.join(CLIENT_DIST,"index.html");if(fs.existsSync(fp))res.sendFile(fp);else res.json({ok:true})});

const httpServer=createServer(app),wss=new WebSocketServer({server:httpServer,path:"/ws"});
wss.on("connection",ws=>{
  const all=scanAllSessions();
  ws.send(JSON.stringify({type:"init",payload:{sessions:all,currentSessionId:sessionMeta?.id||all[0]?.id,stats:computeStats(all),liveSession:{meta:sessionMeta,turns:buildClientTurns(),planSteps},liveMetrics:{tokens:tokenMetrics,toolCalls:toolCalls.length,turns:turns.map(t=>({n:t.n,tc:t.tc,tokens:t.tokens,done:!!t.finishedAt,aborted:!!t.aborted,compacted:!!t.compacted}))}}}));
  ws.on("message",raw=>{
    try{
      const msg=JSON.parse(raw.toString());
      if(msg.type==="load_session"){
        const all=scanAllSessions(),s=all.find(x=>x.id===msg.sessionId||x.id.startsWith(msg.sessionId));
        if(s){
          const d=loadSession(s.filePath);
          ws.send(JSON.stringify({type:"session_loaded",payload:{session:s,meta:d.meta,turns:d.turns.map(t=>({...t,tTools:d.toolCalls.filter(tc=>tc.turnN===t.n).map(c=>({id:c.id,name:c.name,ts:c.ts,dur:c.dur,done:c.done,args:c.args,argsFull:c.argsFull,output:c.output,outputFull:c.outputFull,error:c.error,outputSize:c.outputSize,readFiles:c.readFiles}))})),planSteps:d.planSteps}}));
        }
      }
    }catch{}
  });
});

function broadcast(t,p){const m=JSON.stringify({type:t,payload:p});wss.clients.forEach(c=>{if(c.readyState===1)c.send(m)});}

setInterval(()=>{
  const s=scanAllSessions();
  if(s.length>0&&s[0].filePath!==currentSessionFile){console.log("switch:",s[0].filePath.split("\\").pop());switchToSession(s[0].filePath);broadcast("new_session",{})}
  broadcast("stats_update",computeStats(s));
},5000);

const ses=scanAllSessions(),sts=computeStats(ses);
console.log(ses.length,"sessions | Today:",(sts.today.tokens/1000).toFixed(1)+"K","| Month:",(sts.month.tokens/1e6).toFixed(1)+"M");
if(ses.length>0)switchToSession(ses[0].filePath);
httpServer.listen(PORT,()=>console.log("Mindrift http://localhost:"+PORT));
