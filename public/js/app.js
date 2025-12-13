const LOGO_DATA = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjY2NjIi8+PC9zdmc+";
const SMALL_ICON_URL = "https://i.gyazo.com/53fff333901fd2d65bfe9ff2d20e3f2d.png";
const USER_ICON_URL = "https://i.gyazo.com/77b9d2a0eccb6b2b8be8ad83d0d17b8f.png";
let GAS_URL = 'https://script.google.com/macros/s/AKfycbxwvGywEkcIGM_SoAmh38za2stHtoD5LV2GllifC-xSS23wUWvu9J_yxbn0SaqMrhghWg/exec';

const State = {
    view: 'login', userID: '', userName: '',
    activeGoals: [], selectedGoal: null,
    userRecords: [], currentChat: [],
    recordData: null, pendingData: null, nextGoalNo: 1,
    isGoalSettingMode: false 
};

const appDiv = document.getElementById('app');

/* --- ユーティリティ --- */
function getFormattedDate() {
    const d = new Date();
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function formatDateForDisplay(dStr) {
    if(!dStr) return ''; const d=new Date(dStr); if(isNaN(d))return dStr;
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function getGoalMainText(t) { return t ? t.split(' (')[0] : ''; }
function extractLLMData(txt) {
    let c = txt.replace(/```json/g,'').replace(/```/g,'');
    const f = c.indexOf('{'), l = c.lastIndexOf('}');
    if(f!==-1 && l!==-1 && l>f){ try{ return {text:(c.substring(0,f)+c.substring(l+1)).trim(), data:JSON.parse(c.substring(f,l+1))}; }catch(e){} }
    return { text: c, data: null };
}

/* --- API通信 --- */
async function fetchGAS(method, data = {}) {
    const url = new URL(GAS_URL); url.searchParams.set('cb', Date.now());
    if(method==='GET') Object.keys(data).forEach(k=>url.searchParams.append(k,data[k]));
    for(let i=0; i<3; i++){
        try{
            const opts = {method, headers:{'Content-Type':'text/plain;charset=utf-8'}};
            if(method==='POST') opts.body=JSON.stringify(data);
            const r = await fetch(url.toString(), opts); if(r.ok) return await r.json();
        }catch(e){ await new Promise(r=>setTimeout(r,1000)); }
    }
    return {status:'error'};
}

// LLM呼び出し
async function fetchLLM(userPrompt) {
    let sys = "";

    // A: 目標設定モード
    if (State.isGoalSettingMode) {
        sys = `
        あなたは「ライフロ」という名前のAIコーチ（妖精）です。
        ユーザー名：「${State.userName}」さん。口調：親しみやすく、元気で、絵文字（🌱,🚀,✨）を多用。
        役割：ユーザーと対話して「目標」「カテゴリ」「最初の一歩」を決めるサポート役。
        
        【ルール】
        1. ユーザーの希望を聞き出し、3つの要素（目標、カテゴリ、一歩）が固まるまで優しく質問してください。
        2. 内容が確定したら、「では、この内容で進めますね！✨」等と締めて、最後に以下のJSONのみを出力してください。
           （確定するまではJSONを出さないでください）
        
        【出力JSONフォーマット】
        {
          "goal": "目標名",
          "category": "仕事・キャリア / 健康・運動 / 趣味・教養 / 人間関係 / その他",
          "step": "最初の一歩"
        }`;
    }
    
    // B: 記録モード
    else if (State.selectedGoal) {
        let currentContext = "";
        let latestRegoal = null;
        const goalRecords = State.userRecords.filter(r => r.goalNo == State.selectedGoal.goalNo).sort((a, b) => new Date(b.date) - new Date(a.date));
        const latestRec = goalRecords.find(r => r.regoalAI);
        if (latestRec) {
            latestRegoal = latestRec.regoalAI;
            currentContext = `【現在の調整課題 (最優先)】: ${latestRegoal}\n(※この課題の続きとして対話してください)`;
        } else {
            const firstStep = State.selectedGoal.goal.split('1st:')[1]?.slice(0, -1) || '不明';
            currentContext = `【初期設定の第一歩】: ${firstStep}\n(※もしユーザーの進捗がこれを越えている場合は、会話内容を優先してください)`;
        }

        // B-1: 初回分析
        if (!State.pendingData || !State.pendingData.challengeAI) {
            sys = `
            あなたは「ライフロ」という名前のAIコーチ（妖精のキャラクター）です。
            役割：ユーザーの目標達成を支援するため、作業療法士(OT)のような視点で、挑戦と能力のバランス（フロー状態）を専門的に分析・調整します。
            口調：親しみやすく、元気で、絵文字（ 🌱 ,  🚀 ,  ✨ など）を多用する。「〜ですね！」「〜しましょう！」など。
            ★ユーザー名：「${State.userName}」さん
            【コンテキスト】
            目標: ${getGoalMainText(State.selectedGoal?.goal)}
            ${currentContext}
            【★思考プロセス（最重要：AIによる独立評価）】
            ユーザーが入力した「数値（CSバランス）」には**一切影響されずに**、会話内容・行動事実・環境要因のみから、ゼロベースで以下の基準で評価を行ってください。
            1. **PEOモデル（Person-Environment-Occupation）に基づく分析**:
            - **挑戦度 (Challenge)**: ユーザーの主観的な「辛さ」ではなく、対象となった課題・行動・思考の「本質的な難しさ・構造的複雑性（知的探求含む）」を客観的に評価してください。
            - **能力度 (Skill)**: ユーザーの自信の有無ではなく、その課題に対して「どの程度、有効な知識・技能・工夫・行動を発揮できたか（パフォーマンス）」を評価してください。
            2. **時間軸と全体像の考慮**:
            - 一時的な成功/失敗に依存せず、目標全体における現在地（初期/中盤/仕上げ）やゴールとの距離感を踏まえて判断してください。
            3. **比較と結論**:
            - あなたが導き出した客観的評価と、ユーザーの自己評価が**食い違っていても構いません（むしろそのズレが重要です）。**
            【★出力生成】
            上記の思考プロセスで導き出した**「AI独自の評価」とその「根拠」**を、以下のJSON形式で出力してください。
            **JSON内のテキストは、全て「ライフロ」のキャラクター口調（丁寧なタメ口・絵文字あり）に翻訳して記述すること。**
            JSONフォーマット:
            {
            "challengeAI": 1-7 (AIが独自に判定した数値),
            "skillAI": 1-7 (AIが独自に判定した数値),
            "reasonAI": "『私の見立てでは〜〜です。なぜなら〜〜だからです』という内容を、親しみやすく伝える文章。",
            "regoalAI": "提案する調整課題。次回の挨拶で『前回の課題は【これ】でしたね！』と引用しやすいよう、『〇〇をやってみる！ 🔥 』などの30文字以内の具体的で短いアクションフレーズ。"
            }
            ※ JSONのみを出力してください。Markdownタグは不要です。
            `;
        } 
        // B-2: 調整相談
        else {
            sys = `
            あなたは「ライフロ」です。
            役割：提示した課題に対するユーザーの反応を受け、対話または課題の微調整を行います。
            【コンテキスト】目標: ${getGoalMainText(State.selectedGoal.goal)}
            
            【重要ルール】
            1. **数値評価（Challenge/Skill）や分析（Reason）は絶対に行わないでください。**（初回で実施済みのため）
            2. ユーザーの話に共感し、励ましたりアドバイスをしてください。
            3. 会話の流れで「次回の課題(regoalAI)」を変更すべき場合のみ、会話の最後に以下のJSONを追記してください。
               変更不要ならJSONは出力せず、文章のみで返答してください。
            
            { "regoalAI": "新しい調整課題" }
            `;
        }
    }

    const history = State.currentChat.map(m => ({ role: m.role==='bot'?'model':'user', parts:[{text:m.text}] }));
    
    try {
        const c = new AbortController(); setTimeout(()=>c.abort(), 40000);
        const r = await fetch('/api/gemini', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ history, message:userPrompt, systemInstruction:sys }),
            signal: c.signal
        });
        if(!r.ok) throw new Error('API Error');
        const d = await r.json();
        return d.text || "";
    } catch(e) { console.error(e); return "通信エラーです。もう一度試してください。"; }
}

/* --- UI操作 --- */
function render() {
    appDiv.innerHTML = '';
    let tId = 'login-template';
    if(State.view==='top') tId='top-menu-template';
    else if(State.view==='goals') tId='goal-management-template';
    else if(State.view==='record') tId='record-input-template';
    else if(State.view==='review') tId='review-template';
    else if(State.view==='theory') tId='theory-template';
    
    appDiv.appendChild(document.getElementById(tId).content.cloneNode(true));
    if(State.view==='login') initLogin();
    else if(State.view==='top') initTop();
    else if(State.view==='goals') initGoals();
    else if(State.view==='record') initRecord();
    else if(State.view==='review') initReview();
    else if(State.view==='theory') document.querySelector('.back-button').onclick=()=>navigateTo('top');
}

function navigateTo(v, d={}) {
    window.scrollTo(0,0);
    if(v==='record' && State.view!=='record'){ 
        State.currentChat=[]; State.recordData=null; State.pendingData=null; State.isGoalSettingMode=false; 
    }
    if(d.goal) State.selectedGoal=d.goal;
    else if(v!=='record') State.selectedGoal=null;
    
    State.view=v; render();
}

function showModal({ title, message, showInput, inputType='default', placeholder, showCancel }) {
    return new Promise(resolve => {
        const t = document.getElementById('modal-template').content.cloneNode(true);
        const b = t.getElementById('modal-backdrop');
        t.getElementById('modal-title').textContent = title;
        t.getElementById('modal-content').innerHTML = message||'';
        
        if(showInput){
            if(inputType==='goal-form') t.getElementById('modal-goal-form').classList.remove('hidden');
            else { 
                const ic = t.getElementById('modal-input-container'); 
                ic.classList.remove('hidden'); 
                ic.querySelector('input').placeholder = placeholder||'';
            }
        }
        if(showCancel) {
            const c = t.getElementById('modal-cancel');
            c.classList.remove('hidden');
            c.onclick = () => { document.body.removeChild(b); resolve(null); };
        }
        t.getElementById('modal-ok').onclick = () => {
            let res = true;
            if(showInput){
                if(inputType==='goal-form'){
                    const g = document.getElementById('goal-input-main').value;
                    const c = document.getElementById('goal-input-category').value;
                    const s = document.getElementById('goal-input-step').value;
                    const st = document.getElementById('goal-input-status').value;
                    if(!g) { alert('目標内容は必須です'); return; }
                    res = {goal:g, category:c, step:s, status:st};
                } else {
                    res = document.getElementById('modal-input').value;
                }
            }
            document.body.removeChild(b); resolve(res);
        };
        document.body.appendChild(b);
    });
}

function addChatMessage(html, role, type) {
    const area = document.getElementById('record-chat-area');
    if(!area) return;
    const t = document.getElementById('chat-message-template').content.cloneNode(true);
    const row = t.querySelector('[data-role="message-row"]');
    const bub = t.querySelector('.message-bubble');
    const ico = t.querySelector('.bot-icon');
    
    bub.innerHTML = html;
    if(role==='user'){
        row.classList.add('justify-end');
        bub.classList.add('bg-green-100', 'text-gray-800', 'chat-bubble-user', 'rounded-tr-none');
    } else {
        row.classList.add('justify-start');
        ico.classList.remove('hidden');
        if(type==='analysis') bub.classList.add('bg-blue-50', 'border-blue-200');
        else if(type==='regoal') bub.classList.add('bg-orange-50', 'border-orange-200');
        else bub.classList.add('bg-emerald-50');
    }
    area.appendChild(t.firstElementChild);
    State.currentChat.push({role, text:html.replace(/<[^>]*>/g,'')});
    setTimeout(()=>area.scrollTop=area.scrollHeight, 100);
}

/* --- 各画面初期化 --- */
function initLogin() {
    const loginForm = document.getElementById('login-form');
    const loginBtn = document.getElementById('login-button');
    const regBtn = document.getElementById('register-button');
    
    const doAuth = async(act) => {
        const uid = document.getElementById('userID').value.trim();
        const unm = document.getElementById('userName').value.trim();
        if(!uid || !unm) return customAlert('入力してください');
        
        if(act==='register' && uid.startsWith('26') && uid.length===6) {
            return customAlert('この番号は新規登録できません');
        }

        if(loginBtn) { loginBtn.disabled=true; loginBtn.textContent='...'; }
        const r = await fetchGAS('POST', {action:act, userID:uid, userName:unm});
        if(r.status==='success'){
            State.userID=uid; State.userName=unm;
            await customAlert('ログイン成功！'); await fetchUserData(); navigateTo('top');
        } else {
            customAlert(r.message); 
            if(loginBtn) { loginBtn.disabled=false; loginBtn.textContent='ログイン'; }
        }
    };

    if (loginForm) loginForm.onsubmit = (e)=>{ e.preventDefault(); doAuth('auth'); };
    if (loginBtn) loginBtn.onclick = (e)=>{ e.preventDefault(); doAuth('auth'); };
    if (regBtn) regBtn.onclick = ()=>{ doAuth('register'); };
}

function initTop() {
    document.getElementById('welcome-userName').textContent = State.userName;
    document.getElementById('logout-button').onclick = () => { State.userID=''; navigateTo('login'); };
    if(State.userID.startsWith('26') && State.userID.length===6) {
        document.querySelector('[data-action="theory"]').style.display='none';
    }
}

// 目標設定相談チャット
function startGoalConsultation() {
    const t = document.getElementById('goal-consult-template').content.cloneNode(true);
    const back = t.getElementById('consult-backdrop');
    const area = t.getElementById('consult-chat-area');
    const inp = t.getElementById('consult-input');
    const send = t.getElementById('consult-send');
    
    document.body.appendChild(back);
    State.isGoalSettingMode = true; // ★モードON
    State.currentChat = [];

    const add = (txt, role) => {
        const d = document.createElement('div');
        d.className = `flex w-full items-start gap-2 mb-4 ${role==='user'?'justify-end':'justify-start'}`;
        const ico = role==='user'?'':`<div class="w-8 h-8 rounded-full bg-white flex items-center justify-center border border-gray-200 shadow-sm"><img src="${SMALL_ICON_URL}" class="w-full h-full object-contain"></div>`;
        const bub = `<div class="max-w-[85%] p-3 rounded-2xl text-sm shadow-sm leading-relaxed ${role==='user'?'bg-emerald-100 text-gray-800 rounded-tr-none':'bg-white border border-gray-200 rounded-tl-none'}">${txt}</div>`;
        d.innerHTML = role==='user'?bub:(ico+bub);
        area.appendChild(d);
        area.scrollTop = area.scrollHeight;
        State.currentChat.push({role, text:txt});
    };

    add("こんにちは！一緒に目標を考えましょう！✨\n最近気になっていることや、やってみたいことはありますか？", 'bot');

    t.getElementById('consult-close').onclick = () => {
        document.body.removeChild(back);
        State.isGoalSettingMode = false; // モードOFF
    };

    send.onclick = async () => {
        const txt = inp.value.trim();
        if(!txt) return;
        inp.value=''; add(txt, 'user'); send.disabled=true; send.textContent='...';
        
        const resRaw = await fetchLLM(txt); 
        const {text, data} = extractLLMData(resRaw);
        
        if(text) add(text.replace(/\n/g,'<br>'), 'bot');
        
        if(data) {
            document.body.removeChild(back);
            State.isGoalSettingMode = false;
            
            await new Promise(r=>setTimeout(r,300));
            const msg = `<div class="text-left bg-gray-50 p-3 rounded border border-gray-200 text-sm space-y-1">
                <p><b>🎯 目標:</b> ${data.goal}</p>
                <p><b>📂 カテゴリ:</b> ${data.category}</p>
                <p><b>👣 第一歩:</b> ${data.step}</p>
            </div>`;
            const ok = await showModal({title:'この内容でセットしますか？', message:msg, showCancel:true});
            if(ok) {
                const mMain = document.getElementById('goal-input-main');
                const mCat = document.getElementById('goal-input-category');
                const mStep = document.getElementById('goal-input-step');
                if(mMain) mMain.value = data.goal;
                if(mCat) mCat.value = data.category;
                if(mStep) mStep.value = data.step;
            }
        }
        send.disabled=false; send.textContent='送信';
    };
}

function initGoals() {
    const lst = document.getElementById('goal-list');
    let currentTab = 'active';
    const tabActive = document.getElementById('tab-active');
    const tabHistory = document.getElementById('tab-history');
    const baseTabClass = "flex-1 px-4 py-3 text-sm font-bold transition-colors text-center";
    const activeStyle = "text-emerald-600 border-b-4 border-emerald-600";
    const historyStyle = "text-orange-500 border-b-4 border-orange-500";
    const inactiveStyle = "text-gray-400 hover:text-gray-600 border-b border-gray-200";
    const switchTab = (tab) => {
        currentTab = tab;
        if(tab === 'active') { tabActive.className = `${baseTabClass} ${activeStyle}`; tabHistory.className = `${baseTabClass} ${inactiveStyle}`; }
        else { tabActive.className = `${baseTabClass} ${inactiveStyle}`; tabHistory.className = `${baseTabClass} ${historyStyle}`; }
        ren();
    };
    if(tabActive && tabHistory) { tabActive.onclick = () => switchTab('active'); tabHistory.onclick = () => switchTab('history'); }
    
    // ステータス変更処理（共通）
    const handleGoalStatusChange = async(g, newGoalNo, actionLabel) => {
        if (actionLabel === '完全に削除') {
            const confirmDelete = await customPrompt(`[#${g.goalNo}] ${getGoalMainText(g.goal)}を完全に削除しますか？\n（復旧はできません）\n確認のため「${g.goalNo}」と入力してください。`, g.goalNo);
            if (!confirmDelete || confirmDelete !== g.goalNo.toString()) {
                if (confirmDelete) customAlert('入力が一致しませんでした。');
                return;
            }
        } 
        
        let reason = '';
        if (actionLabel === '中止') {
            reason = await customPrompt(`[#${g.goalNo}] ${getGoalMainText(g.goal)}を中止する理由を教えてください:`);
            if(!reason) return;
        } else if (actionLabel === '達成' || actionLabel === '再開') {
            reason = await customPrompt(`[#${g.goalNo}] ${getGoalMainText(g.goal)}についてのコメントを教えてください:`);
            if(!reason) return;
        }

        if (actionLabel === '完全に削除') {
            reason = `完全に削除しました by ${State.userName}`;
        }
        
        await fetchGAS('POST', { action:'saveData', date:getFormattedDate(), userID:State.userID, userName:State.userName, goalNo:newGoalNo, goal:g.goal, reasonU:reason });
        customAlert(`${actionLabel}しました！✨`); 
        await fetchUserData(); ren();
    };

    const ren = () => {
        lst.innerHTML = '';
        const targets = State.activeGoals.filter(g => {
            if (currentTab === 'active') return !g.status;
            return g.status === '達成' || g.status === '中止';
        });
        if(!targets.length) lst.innerHTML = '<p class="text-center text-gray-400 mt-10">目標がありません</p>';
        
        targets.forEach(g => {
            const t = document.getElementById('goal-card-template').content.cloneNode(true);
            const main = g.goal.split(' (')[0];
            const cat = (g.goal.match(/Cat:(.*?)(?:,|$)/)||[])[1];
            const step = (g.goal.match(/1st:(.*?)(?:,|$)/)||[])[1];
            
            const titleEl = t.querySelector('[data-field="goal-title"]');
            const card = t.querySelector('.goal-card');
            
            if(titleEl) {
                let prefix = g.status === '達成' ? '🎉 ' : (g.status === '中止' ? '⏹️ ' : '');
                let titleClass = 'text-gray-800';
                if(g.status === '達成') { 
                    card.classList.replace('bg-white','bg-purple-50'); 
                    card.classList.replace('border-emerald-100','border-purple-200'); 
                } else if(g.status === '中止') { 
                    titleClass = 'text-gray-500'; 
                    card.classList.replace('bg-white','bg-gray-100'); 
                    card.classList.replace('border-emerald-100','border-gray-200'); 
                }
                titleEl.textContent = `[#${g.goalNo}] ${prefix}${main}`;
                titleEl.classList.add(titleClass);
            }

            if(cat) { const c = t.querySelector('[data-field="goal-cat-tag"]'); c.textContent=cat; c.classList.remove('hidden'); }
            if(step) { t.querySelector('.goal-step-text').textContent=step; t.querySelector('[data-field="goal-step"]').classList.remove('hidden'); }
            
            const recBtn = t.querySelector('[data-action="start-record"]');
            const editBtn = t.querySelector('.edit-btn');
            const markCompBtn = t.querySelector('[data-action="mark-complete"]');
            const markCancelBtn = t.querySelector('[data-action="mark-cancel"]');
            const histResumeBtn = t.querySelector('[data-action="resume-goal"]');
            const histDeleteBtn = t.querySelector('[data-action="delete-goal"]');

            if(currentTab==='active') {
                recBtn.classList.remove('hidden');
                markCompBtn.classList.remove('hidden');
                markCancelBtn.classList.remove('hidden');
                histResumeBtn.classList.add('hidden');
                histDeleteBtn.classList.add('hidden');

                recBtn.onclick = () => navigateTo('record', {goal:g});
                markCompBtn.onclick = () => handleGoalStatusChange(g, 10000 + g.goalNo, '達成');
                markCancelBtn.onclick = () => handleGoalStatusChange(g, 20000 + g.goalNo, '中止');
            } else {
                recBtn.classList.add('hidden');
                markCompBtn.classList.add('hidden');
                markCancelBtn.classList.add('hidden');
                histResumeBtn.classList.remove('hidden');
                histDeleteBtn.classList.remove('hidden');

                histResumeBtn.onclick = () => handleGoalStatusChange(g, g.goalNo, '再開');
                histDeleteBtn.onclick = () => handleGoalStatusChange(g, 30000 + g.goalNo, '完全に削除');
            }
            
            if(editBtn) {
                editBtn.onclick = async()=>{
                    const res = await showModal({title:'編集', showInput:true, inputType:'goal-form', showCancel:true});
                    if(res){
                        let sid = g.goalNo;
                        if(res.status==='達成') sid += 10000;
                        else if(res.status==='中止') sid += 20000;
                        await fetchGAS('POST', {action:'saveData', date:getFormattedDate(), userID:State.userID, userName:State.userName, goalNo:sid, goal:`${res.goal} (Cat:${res.category}, 1st:${res.step})`});
                        await fetchUserData(); ren(currentTab);
                    }
                };
            }
            lst.appendChild(t);
        });
    };
    
    document.getElementById('tab-active').onclick = ()=>switchTab('active');
    document.getElementById('tab-history').onclick = ()=>switchTab('history');
    
    const isControl = State.userID.startsWith('26') && State.userID.length===6;
    document.getElementById('add-goal-button').onclick = async () => {
        const p = showModal({title:'新規登録', showInput:true, inputType:'goal-form', showCancel:true});
        
        // 統制群以外なら相談ボタン注入
        if(!isControl) {
            setTimeout(()=>{
                const f = document.getElementById('modal-goal-form');
                if(f && !document.getElementById('consult-btn')) {
                    const b = document.createElement('button');
                    b.id='consult-btn';
                    b.className='w-full py-2 bg-emerald-100 text-emerald-700 font-bold rounded-lg mb-4 flex items-center justify-center gap-2';
                    b.innerHTML='<span>🤖</span> ライフロと一緒に目標を考える';
                    b.onclick=(e)=>{ e.preventDefault(); startGoalConsultation(); };
                    f.insertBefore(b, f.firstChild);
                }
            }, 50);
        }
        
        const res = await p;
        if(res){
            await fetchGAS('POST', {action:'saveData', date:getFormattedDate(), userID:State.userID, userName:State.userName, goalNo:State.nextGoalNo, goal:`${res.goal} (Cat:${res.category}, 1st:${res.step})`});
            customAlert('登録しました'); await fetchUserData(); ren('active');
        }
    };
    ren('active');
}

function initRecord() {
    const sel = document.getElementById('record-goal-select');
    sel.innerHTML = State.activeGoals.map(g => `<option value="${g.goalNo}" ${State.selectedGoal?.goalNo==g.goalNo?'selected':''}>${getGoalMainText(g.goal)}</option>`).join('');
    sel.onchange = (e) => State.selectedGoal = State.activeGoals.find(g=>g.goalNo==e.target.value);
    if(!State.selectedGoal && State.activeGoals.length) State.selectedGoal = State.activeGoals[0];

    const isControl = State.userID.startsWith('26') && State.userID.length===6;
    const btn = document.getElementById('submit-initial-record');
    btn.textContent = isControl ? '記録を送信する' : '記録してライフロと相談する';

    // バナー表示
    const banner = document.getElementById('last-regoal-banner');
    if(banner) banner.classList.add('hidden');
    if(!isControl) {
        setTimeout(()=>{
            const recs = State.userRecords.filter(r=>r.goalNo==State.selectedGoal?.goalNo).sort((a,b)=>new Date(b.date)-new Date(a.date));
            const last = recs.find(r=>r.regoalAI)?.regoalAI;
            if(last && banner) { document.getElementById('last-regoal-text').textContent=last; banner.classList.remove('hidden'); }
        }, 50);
    }

    // 評価フォーム送信 (初回)
    document.getElementById('cs-evaluation-form').onsubmit = async (e) => {
        e.preventDefault();
        const c = document.querySelector('input[name="challengeU"]:checked')?.value;
        const s = document.querySelector('input[name="skillU"]:checked')?.value;
        const r = document.getElementById('reasonU').value;
        if(!c || !s) return customAlert('評価を選択してください');

        btn.disabled=true; btn.textContent='...';
        State.recordData = {challengeU:c, skillU:s, reasonU:r};
        
        // ★画面切り替え (ユーザー入力を先に表示してフリーズ感をなくす)
        const userTxt = `目標: ${getGoalMainText(State.selectedGoal.goal)}\n自己評価: 挑${c}/能${s}\n理由: ${r}`;
        addChatMessage(userTxt.replace(/\n/g,'<br>'), 'user');
        e.target.classList.add('hidden');
        document.getElementById('continue-chat-area').classList.remove('hidden');

        // AI呼び出し (State.pendingDataがないので、自動的に初期分析プロンプトが使われる)
        const resRaw = await fetchLLM(userTxt);
        handleAI(resRaw);
        btn.disabled=false;
    };

    // チャット送信 (2回目以降)
    document.getElementById('send-chat-button').onclick = async () => {
        const inp = document.getElementById('chat-input');
        const txt = inp.value.trim();
        if(!txt) return;
        inp.value='';
        addChatMessage(txt, 'user');
        
        // AI呼び出し (State.pendingDataが既にあるので、自動的にチャットプロンプトが使われる)
        const resRaw = await fetchLLM(txt);
        handleAI(resRaw);
    };

    const handleAI = (raw) => {
        const {text, data} = extractLLMData(raw);
        if(isControl) {
            addChatMessage("記録しました。継続しましょう！🌱", 'bot');
            if(data) State.pendingData = data;
            document.getElementById('additional-chat-container').classList.add('hidden');
            document.getElementById('save-recommend-text').style.display = 'none';
        } else {
            if(text) addChatMessage(text.replace(/\n/g,'<br>'), 'bot');
            if(data) {
                // 既存データとマージ (初回は全て、2回目以降はRegoalのみ更新など)
                State.pendingData = { ...State.pendingData, ...data };
                
                if(data.challengeAI) {
                    addChatMessage(`<b>📊 分析結果 (挑${data.challengeAI}/能${data.skillAI})</b><br>${data.reasonAI}`, 'bot', 'analysis');
                }
                if(data.regoalAI) {
                    addChatMessage(`<b>🚩 調整課題</b><br>${data.regoalAI}`, 'bot', 'regoal');
                }
            }
        }
    };

    document.getElementById('finalize-save-button').onclick = async () => {
        if(!State.pendingData) return customAlert('保存するデータがありません');
        const d = State.pendingData;
        const r = State.recordData;
        await fetchGAS('POST', {
            action:'saveData', date:getFormattedDate(), userID:State.userID, userName:State.userName,
            goalNo:State.selectedGoal.goalNo, goal:State.selectedGoal.goal,
            challengeU:r.challengeU, skillU:r.skillU, reasonU:r.reasonU,
            challengeAI:d.challengeAI, skillAI:d.skillAI, reasonAI:d.reasonAI, regoalAI:d.regoalAI
        });
        await fetchUserData();
        customAlert('保存しました！');
        navigateTo('top');
    };
}

function initReview() {
    const sel = document.getElementById('review-goal-selector');
    const box = document.getElementById('record-details-container');
    const reviewableGoals = State.activeGoals.filter(g => State.userRecords.some(r => r.goalNo==g.goalNo && r.challengeU));
    
    if(reviewableGoals.length===0){ box.innerHTML='<p class="text-gray-500 p-4">記録なし</p>'; return; }
    
    sel.innerHTML = reviewableGoals.map(g => `<option value="${g.goalNo}">#${g.goalNo} ${getGoalMainText(g.goal).substr(0,15)}...</option>`).join('');
    
    const uidStr = State.userID.toString();
    const isControl = uidStr.startsWith('26') && uidStr.length === 6;
    if (isControl && document.getElementById('review-chart-card')) {
        document.getElementById('review-chart-card').style.display = 'none';
    }

    const load = (gn) => {
        const recs = State.userRecords.filter(r => r.goalNo==gn && r.challengeU).sort((a,b)=>new Date(a.date)-new Date(b.date));
        if(document.getElementById('chart-title')) document.getElementById('chart-title').textContent = `${getGoalMainText(reviewableGoals.find(t=>t.goalNo==gn)?.goal||'')} の推移`;
        
        // グラフ描画
        const ctx = document.getElementById('flowChart').getContext('2d');
        if(window.flowChartInstance) window.flowChartInstance.destroy();
        const uPts = recs.map(r => ({x:parseFloat(r.skillU), y:parseFloat(r.challengeU)}));
        const aPts = recs.filter(r=>r.skillAI).map(r => {
            let x=parseFloat(r.skillAI), y=parseFloat(r.challengeAI);
            if(x===parseFloat(r.skillU) && y===parseFloat(r.challengeU)) { x+=0.15; y+=0.15; }
            return {x,y};
        });
        
        window.flowChartInstance = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [
                    { label: 'あなた', data: uPts, borderColor: '#10b981', backgroundColor: '#10b981', showLine: true },
                    { label: 'ライフロ', data: aPts, borderColor: '#f97316', backgroundColor: '#f97316', showLine: true, borderDash: [5,5] }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { x: {min:1, max:7, title:{display:true, text:'能力'}}, y: {min:1, max:7, title:{display:true, text:'挑戦'}} },
                plugins: { legend: {display:false} }
            }
        });

        box.innerHTML='';
        [...recs].reverse().forEach(r => {
            const aiInfo = (!isControl && r.skillAI) ? `<div class="mt-2 text-sm bg-orange-50 p-2 rounded"><span class="font-bold text-orange-600">AI評価: 挑${r.challengeAI}/能${r.skillAI}</span><p class="text-xs text-gray-600 mt-1">${r.reasonAI||''}</p></div>` : '';
            const regoalInfo = (!isControl && r.regoalAI) ? `<div class="mt-2 pt-2 border-t border-orange-100 text-sm"><span class="font-bold text-emerald-600">🚩 ${r.regoalAI}</span></div>` : '';
            const d = document.createElement('div');
            d.className = 'bg-white p-3 rounded shadow-sm border border-gray-200';
            d.innerHTML = `<div class="text-xs text-gray-500 mb-1">${formatDateForDisplay(r.date)}</div><div class="text-sm"><span class="font-bold text-emerald-600">自己評価: 挑${r.challengeU}/能${r.skillU}</span><p class="text-xs text-gray-700 mt-1">${r.reasonU||''}</p></div>${aiInfo}${regoalInfo}`;
            box.appendChild(d);
        });
    };
    load(reviewableGoals[0].goalNo);
    sel.onchange=(e)=>load(e.target.value);
    document.querySelector('.back-button').onclick = () => navigateTo('top');
}

function initTheoryPage() { document.querySelector('.back-button').onclick = () => navigateTo('top'); }

window.onload = function() { render(); };
appDiv.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (t && !t.getAttribute('onclick')) navigateTo(t.dataset.action);
});
