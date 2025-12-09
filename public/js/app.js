const LOGO_DATA = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjY2NjIi8+PC9zdmc+";
const SMALL_ICON_URL = "https://i.gyazo.com/53fff333901fd2d65bfe9ff2d20e3f2d.png";
const USER_ICON_URL = "https://i.gyazo.com/77b9d2a0eccb6b2b8be8ad83d0d17b8f.png";
let GAS_URL = 'https://script.google.com/macros/s/AKfycbxwvGywEkcIGM_SoAmh38za2stHtoD5LV2GllifC-xSS23wUWvu9J_yxbn0SaqMrhghWg/exec';

const State = {
    view: 'login', userID: '', userName: '',
    activeGoals: [], selectedGoal: null,
    userRecords: [], currentChat: [],
    recordData: null, pendingData: null, nextGoalNo: 1
};

const appDiv = document.getElementById('app');

/* =========================================
   ユーティリティ関数
   ========================================= */
function getFormattedDate() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const hr = now.getHours().toString().padStart(2, '0');
    const min = now.getMinutes().toString().padStart(2, '0');
    return `${y}/${m}/${d} ${hr}:${min}`;
}

function formatDateForDisplay(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const dayName = days[d.getDay()];
    const hr = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${dayName}) ${hr}:${min}`;
}

function getGoalMainText(fullText) {
    if (!fullText) return '';
    const splitIndex = fullText.indexOf(' (');
    if (splitIndex !== -1) {
        return fullText.substring(0, splitIndex);
    }
    return fullText;
}

function extractLLMData(txt) {
    let c = txt.replace(/```json/g,'').replace(/```/g,'');
    const f = c.indexOf('{'), l = c.lastIndexOf('}');
    if(f!==-1 && l!==-1 && l>f){
        try{ return { text: (c.substring(0,f)+c.substring(l+1)).trim(), data: JSON.parse(c.substring(f,l+1)) }; }catch(e){}
    }
    return { text: c, data: null };
}

/* =========================================
   通信・API関連
   ========================================= */
async function fetchGAS(method, data = {}) {
    const url = new URL(GAS_URL);
    url.searchParams.set('cb', Date.now());
    if(method === 'GET') Object.keys(data).forEach(k => url.searchParams.append(k, data[k]));
    for(let i=0; i<3; i++){
        try{
            const opts = { method, headers: {'Content-Type': 'text/plain;charset=utf-8'} };
            if(method==='POST') opts.body = JSON.stringify(data);
            const res = await fetch(url.toString(), opts);
            if(res.ok) return await res.json();
            throw new Error(res.status);
        }catch(e){
            if(i===2) return { status: 'error', message: '通信エラー' };
            await new Promise(r=>setTimeout(r, 1000));
        }
    }
}

// LLM呼び出し関数（モード分岐を明確化）
async function fetchLLM(prompt, mode = 'analysis') {
    // 基本設定
    const baseProfile = `あなたは「ライフロ」という名前のAIコーチ（妖精）です。
    ユーザー名：「${State.userName}」さん
    口調：親しみやすく、元気で、絵文字（ 🌱 , 🚀 , ✨ など）を多用する。「〜ですね！」「〜しましょう！」など。`;

    let sys = baseProfile;

    // --- 1. 初回分析モード (Analysis) ---
    if (mode === 'analysis') {
        let currentContext = "";
        let latestRegoal = null;
        if (State.selectedGoal) {
             const goalRecords = State.userRecords.filter(r => r.goalNo == State.selectedGoal.goalNo).sort((a, b) => new Date(b.date) - new Date(a.date));
             const latestRec = goalRecords.find(r => r.regoalAI);
             if (latestRec) latestRegoal = latestRec.regoalAI;
             const firstStep = State.selectedGoal.goal.split('1st:')[1]?.slice(0, -1) || '不明';
             currentContext = latestRegoal 
                ? `【現在の調整課題】: ${latestRegoal}`
                : `【最初の一歩】: ${firstStep}`;
        }

        sys += `
        役割：作業療法士(OT)の視点で、挑戦と能力のバランス（フロー状態）を分析・調整します。
        【コンテキスト】目標: ${getGoalMainText(State.selectedGoal?.goal)}
        ${currentContext}
        【思考プロセス】
        ユーザーの自己評価数値には影響されず、PEOモデル（Person, Environment, Occupation）の観点から客観的に評価してください。
        
        【出力ルール】
        以下のJSON形式のみを出力してください。Markdownや挨拶文は不要です。
        JSONの値には改行を含めないでください。
        
        {
        "challengeAI": 1-7,
        "skillAI": 1-7,
        "reasonAI": "分析結果と根拠（PEOの観点を含めて）",
        "regoalAI": "具体的な調整課題（30文字以内）"
        }`;
    } 
    // --- 2. 相談・調整モード (Chat) ---
    else if (mode === 'chat') {
        sys += `
        役割：ユーザーの記録に対する振り返り会話を行い、必要に応じて「次回の課題(regoalAI)」を微調整します。
        
        【重要ルール】
        1. **数値評価（Challenge/Skill）や分析（Reason）は絶対に行わないでください。**
        2. ユーザーの話に共感し、励ましたりアドバイスをしてください。
        3. 会話の流れで「次回の課題」を変更・具体化する必要が出た場合のみ、会話の最後に以下のJSONを出力してください。
           変更が不要な場合は、文章のみで返答してください。
        
        JSON例（課題変更時のみ）:
        { "regoalAI": "新しい調整課題" }
        `;
    }
    // --- 3. 目標設定モード (Goal Setting) ---
    else if (mode === 'goal_setting') {
        sys += `
        役割：ユーザーと一緒に「目標」「カテゴリ」「最初の一歩」を決めるサポーターです。
        【指示】
        ユーザーの話を聞き出し、目標が定まったら「では、この内容で目標を作成しますね！✨」と締めくくり、
        最後に以下のJSONを出力してください。まだ相談中の場合はJSONを出さないでください。
        
        {
        "goal": "目標名",
        "category": "仕事・キャリア / 健康・運動 / 趣味・教養 / 人間関係 / その他",
        "step": "最初の一歩"
        }`;
    }

    const history = State.currentChat.map(m => ({ role: m.role==='bot'?'model':'user', parts:[{text:m.text}] }));
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 40000); // 40秒タイムアウト

        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history: history, message: prompt, systemInstruction: sys }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error('API Error');
        const data = await response.json();
        return data.text || "";
    } catch (e) {
        console.error(e);
        return "通信エラーが発生しました。もう一度お試しください。";
    }
}

/* =========================================
   UI描画・操作関連
   ========================================= */
function render() {
    appDiv.innerHTML = '';
    let id = 'login-template';
    if(State.view==='top') id='top-menu-template';
    else if(State.view==='goals') id='goal-management-template';
    else if(State.view==='record') id='record-input-template';
    else if(State.view==='review') id='review-template';
    else if(State.view==='theory') id='theory-template';
    
    appDiv.appendChild(document.getElementById(id).content.cloneNode(true));
    
    if(State.view==='login') initLogin();
    else if(State.view==='top') initTop();
    else if(State.view==='goals') initGoals();
    else if(State.view==='record') initRecord();
    else if(State.view==='review') initReview();
    else if(State.view==='theory') initTheoryPage();
}

function navigateTo(v, d={}) {
    window.scrollTo(0, 0);
    if(window.flowChartInstance){ window.flowChartInstance.destroy(); window.flowChartInstance=null; }
    if(v==='record' && State.view!=='record'){ State.currentChat=[]; State.recordData=null; State.pendingData=null; }
    if(d.goal) State.selectedGoal=d.goal;
    State.view=v; render();
}

function showModal({ title, message = '', showInput = false, inputType = 'default', placeholder = '', showCancel = false }) {
    return new Promise((resolve) => {
        const t = document.getElementById('modal-template').content.cloneNode(true);
        const backdrop = t.getElementById('modal-backdrop');
        const tEl = t.getElementById('modal-title'), cEl = t.getElementById('modal-content');
        const iCon = t.getElementById('modal-input-container'), iEl = t.getElementById('modal-input');
        const gForm = t.getElementById('modal-goal-form'), ok = t.getElementById('modal-ok'), can = t.getElementById('modal-cancel');
        tEl.textContent = title; cEl.innerHTML = message;

        if(showInput){
            if(inputType==='default'){ iCon.classList.remove('hidden'); iEl.placeholder=placeholder; }
            else if(inputType==='goal-form') gForm.classList.remove('hidden');
        }
        if(showCancel){
            can.classList.remove('hidden');
            can.onclick = () => { document.body.removeChild(backdrop); resolve(null); };
        }
        ok.onclick = () => {
            let r = true;
            if(showInput){
                if(inputType==='default') r = iEl.value;
                else if(inputType==='goal-form'){
                    const m = document.getElementById('goal-input-main').value;
                    const c = document.getElementById('goal-input-category').value;
                    const s = document.getElementById('goal-input-step').value;
                    const stEl = document.getElementById('goal-input-status');
                    const st = stEl ? stEl.value : '';
                    if(!m){ alert('目標内容必須'); return; }
                    r = { goal: m, category: c, step: s, status: st };
                }
            }
            document.body.removeChild(backdrop); resolve(r);
        };
        document.body.appendChild(backdrop);
        if(showInput && inputType==='default') setTimeout(()=>iEl.focus(),50);
    });
}

async function customAlert(msg) { await showModal({ title: 'お知らせ', message: msg }); }

/* =========================================
   チャット・メッセージ関連
   ========================================= */
function addChatMessage(html, role, type = 'default') {
    const area = document.getElementById('record-chat-area');
    if(!area) return null;
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
        if(type === 'analysis') { bub.classList.add('bg-blue-50', 'text-gray-800', 'border', 'border-blue-200', 'chat-bubble-analysis'); }
        else if(type === 'regoal') { bub.classList.add('bg-orange-50', 'text-gray-800', 'border', 'border-orange-200', 'chat-bubble-regoal'); }
        else { bub.classList.add('bg-emerald-50', 'text-gray-800', 'chat-bubble-ai', 'rounded-tl-none'); }
        ico.classList.remove('hidden');
    }
    const newElement = area.appendChild(t.firstElementChild);
    State.currentChat.push({role, text: html.replace(/<[^>]*>/g, '')});
    if (role === 'user') { setTimeout(()=>area.scrollTop=area.scrollHeight, 100); }
    return newElement;
}

/* =========================================
   ページ初期化関数群
   ========================================= */
function initLogin() {
    const loginForm = document.getElementById('login-form');
    const loginBtn = document.getElementById('login-button');
    const regBtn = document.getElementById('register-button');
    const userIdInput = document.getElementById('userID');
    const userNameInput = document.getElementById('userName');
    
    const auth = async(act) => {
        let uid = userIdInput.value.trim();
        const nm = userNameInput.value.trim();
        if(!uid || !nm){ customAlert('入力してください'); return; }
        uid = parseInt(uid, 10).toString();
        if(loginBtn) { loginBtn.textContent = '...'; loginBtn.disabled = true; }
        
        try {
            const r = await fetchGAS('POST', { action:act, userID:uid, userName:nm });
            if(r.status === 'success'){
                State.userID = uid; State.userName = nm;
                await customAlert('ログインしました！');
                await fetchUserData(); navigateTo('top');
            } else {
                customAlert(`失敗: ${r.message}`);
                if(loginBtn) { loginBtn.textContent = 'ログイン'; loginBtn.disabled = false; }
            }
        } catch(e) {
            customAlert('エラーが発生しました');
            if(loginBtn) { loginBtn.textContent = 'ログイン'; loginBtn.disabled = false; }
        }
    };
    if (loginForm) loginForm.addEventListener('submit', (e) => { e.preventDefault(); auth('auth'); });
    if (regBtn) regBtn.onclick = (e) => { 
        e.preventDefault();
        const uid = userIdInput.value.trim();
        if ((uid.startsWith('16') || uid.startsWith('26')) && uid.length === 6) {
            customAlert('この番号は新規登録できません'); return;
        }
        auth('register'); 
    };
}

async function fetchUserData() {
    const r = await fetchGAS('GET', { action:'fetchData', userID:State.userID, userName:State.userName });
    if(r.status==='success'){
        State.userRecords=r.userRecords;
        const gm = new Map();
        r.userRecords.forEach(d=>{
            const rawG = parseInt(d.goalNo);
            if(rawG > 0 && d.goal) {
                let realID = rawG;
                let status = '';
                if (rawG >= 20000) { status = '中止'; realID = rawG - 20000; }
                else if (rawG >= 10000) { status = '達成'; realID = rawG - 10000; }
                const existing = gm.get(realID);
                const firstDate = existing ? existing.startDate : d.date;
                gm.set(realID, { goalNo: realID, goal: d.goal, startDate: firstDate, lastDate: d.date, status: status });
            }
        });
        State.activeGoals = Array.from(gm.values()).sort((a,b)=>a.goalNo-b.goalNo);
        let mx = 0; r.userRecords.forEach(d=>{ let g = parseInt(d.goalNo); if(g >= 10000) g = g % 10000; if(g > mx && g < 9999) mx = g; });
        State.nextGoalNo = mx + 1;
    }
}

function initTop() {
    document.getElementById('welcome-userName').textContent = State.userName;
    document.getElementById('logout-button').onclick = () => { State.userID=''; navigateTo('login'); };
    const buttons = appDiv.querySelectorAll('.menu-button');
    buttons.forEach(button => {
        button.addEventListener('click', (e) => {
            const target = e.currentTarget;
            const action = target.dataset.action;
            if(action === 'record' && State.activeGoals.length === 0) { customAlert('目標を登録してください'); navigateTo('goals'); } else { navigateTo(action); }
        });
    });
    const uidStr = State.userID.toString();
    if (uidStr.startsWith('26') && uidStr.length === 6) {
        const theoryBtn = document.querySelector('[data-action="theory"]');
        if (theoryBtn) theoryBtn.style.display = 'none';
    }
}

// 目標設定相談用（チャット自動クローズ＆ユーザーアイコンなし）
async function startGoalConsultation() {
    const t = document.getElementById('goal-consult-template').content.cloneNode(true);
    const backdrop = t.getElementById('consult-backdrop');
    const area = t.getElementById('consult-chat-area');
    const input = t.getElementById('consult-input');
    const send = t.getElementById('consult-send');
    const close = t.getElementById('consult-close');

    document.body.appendChild(backdrop);
    State.currentChat = [];

    const addMsg = (txt, role) => {
        const d = document.createElement('div');
        d.className = 'flex w-full items-start gap-2 mb-4 ' + (role === 'user' ? 'justify-end' : 'justify-start');
        const iconHtml = role === 'user' ? '' : `<div class="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 shadow border border-gray-200 overflow-hidden"><img src="${SMALL_ICON_URL}" class="w-full h-full object-contain"></div>`;
        const bubbleHtml = `<div class="max-w-[85%] p-3 rounded-2xl text-sm shadow-sm leading-relaxed ${role === 'user' ? 'bg-emerald-100 text-gray-800 rounded-tr-none' : 'bg-white border border-gray-200 rounded-tl-none'}">${txt}</div>`;
        d.innerHTML = role === 'user' ? bubbleHtml : iconHtml + bubbleHtml;
        area.appendChild(d);
        area.scrollTop = area.scrollHeight;
        State.currentChat.push({role, text:txt});
    };

    addMsg("こんにちは！一緒に目標を考えましょう！✨ \nまずは、最近「やってみたいこと」や「気になっていること」、あるいは「やらなきゃいけないこと」はありますか？", 'bot');

    const handleSend = async () => {
        const txt = input.value.trim();
        if(!txt) return;
        input.value = '';
        addMsg(txt, 'user');
        send.disabled = true; send.textContent = '...';

        try {
            const resRaw = await fetchLLM(txt, 'goal_setting');
            const { text, data } = extractLLMData(resRaw);

            if (text) addMsg(text.replace(/\n/g, '<br>'), 'bot');

            if (data) {
                document.body.removeChild(backdrop);
                await new Promise(r => setTimeout(r, 500));
                
                const confirmMsg = `
                    <div class="text-left space-y-2">
                        <p class="mb-3 text-center font-bold text-emerald-600">この内容でセットしますか？</p>
                        <div class="bg-gray-50 p-3 rounded border border-gray-200">
                            <p class="text-sm"><span class="font-bold">🎯 目標:</span> ${data.goal}</p>
                            <p class="text-sm"><span class="font-bold">📂 カテゴリ:</span> ${data.category}</p>
                            <p class="text-sm"><span class="font-bold">👣 第一歩:</span> ${data.step}</p>
                        </div>
                    </div>`;
                
                const isOk = await showModal({ title: '目標の確認', message: confirmMsg, showCancel: true });
                if (isOk) {
                    const mMain = document.getElementById('goal-input-main');
                    const mCat = document.getElementById('goal-input-category');
                    const mStep = document.getElementById('goal-input-step');
                    if(mMain) mMain.value = data.goal;
                    if(mCat) mCat.value = data.category;
                    if(mStep) mStep.value = data.step;
                }
            }
        } catch(e) {
            console.error(e);
            addMsg("エラーが発生しました。", 'bot');
        } finally {
            send.disabled = false; send.textContent = '送信';
        }
    };

    send.onclick = handleSend;
    close.onclick = () => document.body.removeChild(backdrop);
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
    
    const ren = () => {
        lst.innerHTML = '';
        const targets = State.activeGoals.filter(g => { if (currentTab === 'active') return !g.status; else return g.status; });
        if(targets.length === 0) { lst.innerHTML = `<p class="text-center text-gray-400 mt-10">${currentTab === 'active' ? '進行中の目標はありません 🌱' : '履歴はありません 📜'}</p>`; }
        targets.forEach(g => {
            const template = document.getElementById('goal-card-template');
            if(!template) return;
            const t = template.content.cloneNode(true);
            const fullTitle = g.goal || '';
            const titleOnly = fullTitle.split(' (')[0];
            const catMatch = fullTitle.match(/Cat:(.*?)(?:,|,\s|\)|$)/);
            const stepMatch = fullTitle.match(/1st:(.*?)(?:,|,\s|\)|$)/);
            const category = catMatch ? catMatch[1].trim() : '';
            const step = stepMatch ? stepMatch[1].trim() : '';
            
            const titleEl = t.querySelector('[data-field="goal-title"]');
            if(titleEl) {
                let prefix = g.status === '達成' ? '🎉 ' : (g.status === '中止' ? '⏹️ ' : '');
                titleEl.textContent = `[#${g.goalNo}] ${prefix}${titleOnly}`;
                if(g.status === '中止') titleEl.classList.add('text-gray-400');
            }
            
            const catTag = t.querySelector('[data-field="goal-cat-tag"]');
            if (category && catTag) {
                let colorClass = 'bg-purple-50 text-purple-700 border-purple-200'; let icon = '📂';
                if (category.includes('仕事') || category.includes('キャリア')) { colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200'; icon = '💼'; }
                else if (category.includes('健康') || category.includes('運動')) { colorClass = 'bg-orange-50 text-orange-700 border-orange-200'; icon = '🏃'; }
                else if (category.includes('趣味') || category.includes('教養')) { colorClass = 'bg-blue-50 text-blue-700 border-blue-200'; icon = '📚'; }
                else if (category.includes('人間関係')) { colorClass = 'bg-pink-50 text-pink-700 border-pink-200'; icon = '🤝'; }
                catTag.textContent = `${icon} ${category}`;
                catTag.className = `inline-flex items-center text-xs font-bold px-2 py-1 rounded border ${colorClass}`;
                catTag.classList.remove('hidden');
            }
            
            const dateTag = t.querySelector('[data-field="goal-date-tag"]');
            if (g.startDate && dateTag) {
                const startStr = formatDateForDisplay(g.startDate).split(' ')[0];
                dateTag.textContent = currentTab === 'history' 
                    ? `📅 ${startStr} ～ ${g.lastDate ? formatDateForDisplay(g.lastDate).split(' ')[0] : '???'}`
                    : `📅 登録: ${startStr}`;
                dateTag.classList.remove('hidden');
            }
            
            const stepEl = t.querySelector('[data-field="goal-step"]');
            if (step && stepEl) { t.querySelector('.goal-step-text').textContent = step; stepEl.classList.remove('hidden'); }
            
            t.querySelector('.edit-btn').onclick = async (e) => {
                e.preventDefault();
                const modalPromise = showModal({ title: '目標の編集', showInput: true, inputType: 'goal-form', showCancel: true });
                setTimeout(() => {
                    const mMain = document.getElementById('goal-input-main'); const mCat = document.getElementById('goal-input-category'); const mStep = document.getElementById('goal-input-step'); const mStat = document.getElementById('goal-input-status');
                    if(mMain) mMain.value = titleOnly; if(mCat) mCat.value = category; if(mStep) mStep.value = step; if(mStat) mStat.value = g.status || '';
                }, 50);
                const result = await modalPromise;
                if(!result) return;
                let saveID = g.goalNo;
                if (result.status === '達成') saveID = 10000 + g.goalNo;
                else if (result.status === '中止') saveID = 20000 + g.goalNo;
                await fetchGAS('POST', { action: 'saveData', date: getFormattedDate(), userID: State.userID, userName: State.userName, goalNo: saveID, goal: `${result.goal} (Cat:${result.category}, 1st:${result.step})` });
                customAlert('更新しました！✨'); await fetchUserData(); ren();
            };
            
            const recBtn = t.querySelector('[data-action="start-record"]');
            if (currentTab === 'history') recBtn.classList.add('hidden');
            else recBtn.onclick = () => navigateTo('record', {goal:g});
            
            lst.appendChild(t);
        });
    };
    
    const addBtn = document.getElementById('add-goal-button');
    const uidStr = State.userID.toString();
    const isControl = uidStr.startsWith('26') && uidStr.length === 6;

    if(addBtn) {
        addBtn.onclick = async() => {
            const modalPromise = showModal({ title:'目標登録', showInput:true, inputType:'goal-form', showCancel:true });
            if (!isControl) {
                setTimeout(() => {
                    const formContainer = document.getElementById('modal-goal-form');
                    if(formContainer && !document.getElementById('consult-btn')) {
                        const consultBtn = document.createElement('button');
                        consultBtn.id = 'consult-btn';
                        consultBtn.className = 'w-full py-2 bg-emerald-100 text-emerald-700 font-bold rounded-lg mb-4 hover:bg-emerald-200 transition flex items-center justify-center gap-2';
                        consultBtn.innerHTML = '<span>🤖</span> ライフロと一緒に目標を考える';
                        consultBtn.onclick = (e) => { e.preventDefault(); startGoalConsultation(); };
                        formContainer.insertBefore(consultBtn, formContainer.firstChild);
                    }
                }, 50);
            }
            const i = await modalPromise;
            if(!i) return;
            await fetchGAS('POST', { action:'saveData', date:getFormattedDate(), userID:State.userID, userName:State.userName, goalNo:State.nextGoalNo, goal: `${i.goal} (Cat:${i.category}, 1st:${i.step})` });
            customAlert('登録しました'); await fetchUserData(); ren();
        };
    }
    document.querySelector('.back-button').onclick = () => navigateTo('top');
    ren();
}

function initRecord() {
    if(!State.selectedGoal && State.activeGoals.length>0) State.selectedGoal=State.activeGoals[0];
    const sel = document.getElementById('record-goal-select');
    sel.innerHTML = State.activeGoals.map(g => `<option value="${g.goalNo}" ${State.selectedGoal?.goalNo==g.goalNo?'selected':''}>#${g.goalNo} ${getGoalMainText(g.goal).substr(0,20)}...</option>`).join('');
    sel.onchange = (e) => {
        const g = State.activeGoals.find(item => item.goalNo == e.target.value);
        if (g) { State.currentChat = []; State.recordData = null; State.pendingData = null; navigateTo('record', {goal: g}); }
    };

    const uidStr = State.userID.toString();
    const isControl = uidStr.startsWith('26') && uidStr.length === 6;
    const banner = document.getElementById('last-regoal-banner');
    if(banner) banner.classList.add('hidden');

    if (!isControl) {
        setTimeout(() => {
            const goalRecords = State.userRecords.filter(r => r.goalNo == State.selectedGoal?.goalNo).sort((a, b) => new Date(b.date) - new Date(a.date));
            const lastRegoal = goalRecords.find(r => r.regoalAI)?.regoalAI;
            if (lastRegoal && banner) { 
                document.getElementById('last-regoal-text').textContent = lastRegoal; 
                banner.classList.remove('hidden'); 
            }
        }, 50);
    }

    const mkR = (n, p) => { p.innerHTML=''; for(let i=1;i<=7;i++) p.innerHTML+=`<input type="radio" id="${n}-${i}" name="${n}" value="${i}" class="radio-input hidden"><label for="${n}-${i}" class="radio-label text-center py-2 border rounded hover:bg-emerald-50 text-sm font-bold">${i}</label>`; };
    mkR('challengeU', document.getElementById('challengeU-radios'));
    mkR('skillU', document.getElementById('skillU-radios'));
    
    const form = document.getElementById('cs-evaluation-form');
    const chatArea = document.getElementById('continue-chat-area');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-chat-button');
    const saveBtn = document.getElementById('finalize-save-button');
    const initBtn = document.getElementById('submit-initial-record');
    
    initBtn.textContent = isControl ? '記録を送信する 📤' : '記録してライフロと相談する 🚀';

    // AIレスポンス処理（修正：既存データを保持しつつマージする）
    const handleAIResponse = (raw) => {
        const { text, data } = extractLLMData(raw);
        if (isControl) {
            addChatMessage("記録を受け付けました。<br>継続して取り組みましょう。 🌱", 'bot');
            if (data) State.pendingData = data;
            document.getElementById('additional-chat-container').classList.add('hidden');
            document.getElementById('save-recommend-text').style.display = 'none';
        } else {
            if(text) addChatMessage(text.replace(/\n/g, '<br>'), 'bot');
            if(data) {
                // 既存のデータがあればマージ（Challenge/Skillは上書きしない、Regoalのみ更新など）
                State.pendingData = { ...State.pendingData, ...data };
                
                // 初回分析の表示（Challengeがある場合のみ）
                if(data.challengeAI) {
                    addChatMessage(`<div class="border-b border-blue-200 pb-2 mb-2"><div class="font-bold text-orange-600">📊 ライフロの見立て (挑戦${data.challengeAI}/能力${data.skillAI})</div><div class="font-bold text-blue-600 mt-1">🤔 ライフロの分析</div></div><div class="text-gray-700">${data.reasonAI}</div>`, 'bot', 'analysis');
                }
                // 調整課題の表示（Regoalがある場合）
                if(data.regoalAI) {
                    addChatMessage(`<div class="font-bold text-green-600 mb-1 border-b border-green-200 pb-1">🚩 今後の目標／課題</div>${data.regoalAI}`, 'bot', 'regoal');
                }
            }
        }
    };
    
    form.onsubmit = async(e) => {
        e.preventDefault();
        const c = document.querySelector('input[name="challengeU"]:checked')?.value;
        const s = document.querySelector('input[name="skillU"]:checked')?.value;
        const r = document.getElementById('reasonU').value;
        if(!c || !s){ customAlert('評価を選択してください'); return; }
        
        initBtn.disabled=true; initBtn.textContent = '...';
        State.recordData = { challengeU:c, skillU:s, reasonU:r };
        
        try {
            const p = `目標: ${getGoalMainText(State.selectedGoal.goal)}\n自己評価: 挑戦${c}/能力${s}\n理由: ${r}`;
            addChatMessage(p.replace(/\n/g, '<br>'), 'user');
            form.classList.add('hidden');
            chatArea.classList.remove('hidden');
            
            // 初回は 'analysis' モードでフル分析
            const res = await fetchLLM(p, 'analysis');
            handleAIResponse(res);
        } catch(err) {
            console.error(err);
            addChatMessage("すみません、通信エラーです。保存は可能です。", 'bot');
            State.pendingData = { challengeAI:c, skillAI:s, reasonAI:'通信エラーのため記録のみ', regoalAI:'' };
        } finally {
            initBtn.disabled = false;
        }
    };

    sendBtn.onclick = async() => {
        const txt = chatInput.value.trim();
        if(!txt) return;
        chatInput.value='';
        sendBtn.disabled=true; sendBtn.textContent='...';
        addChatMessage(txt.replace(/\n/g, '<br>'), 'user');
        State.recordData.reasonU += `\n(追記) ${txt}`;
        
        try {
            // 2回目以降は 'chat' モード（JSONは課題変更時のみ）
            const res = await fetchLLM(txt, 'chat'); 
            handleAIResponse(res);
        } catch(err) {
            addChatMessage("エラーが発生しました。", 'bot');
        } finally {
            sendBtn.disabled=false; sendBtn.textContent='送信';
        }
    };
    
    saveBtn.onclick = async() => {
        if(!State.pendingData){ customAlert('保存するデータがありません'); return; }
        saveBtn.textContent='保存中...'; saveBtn.disabled=true;
        const d = State.pendingData;
        const r = State.recordData;
        await fetchGAS('POST', { action:'saveData', date:getFormattedDate(), userID:State.userID, userName:State.userName, goalNo:State.selectedGoal.goalNo, goal:State.selectedGoal.goal, challengeU:r.challengeU, skillU:r.skillU, reasonU:r.reasonU, challengeAI:d.challengeAI, skillAI:d.skillAI, reasonAI:d.reasonAI, regoalAI:d.regoalAI });
        await fetchUserData();
        await customAlert(`<div class="text-center"><div class="flex justify-center mb-2"><img src="https://i.gyazo.com/01113f1d61ac6965070594d2e9fb4ee7.png" alt="Saved" class="w-40 object-contain"></div><p class="font-bold text-lg text-green-700">記録を保存しました！ 🎉 </p><p class="text-sm mt-1">素晴らしい取り組みですね！継続して頑張りましょう！</p></div>`);
        chatArea.classList.add('hidden');
        document.getElementById('coaching-options').classList.remove('hidden');
        document.getElementById('coaching-options').innerHTML = `<div class="text-center p-4 bg-green-50 text-green-700 font-bold rounded-lg mb-4">保存しました！ 🎉</div><button onclick="navigateTo('top')" class="p-3 bg-gray-500 text-white rounded">トップへ</button><button onclick="navigateTo('review')" class="p-3 bg-emerald-500 text-white rounded">これまでの記録を見る</button>`;
    };
    document.querySelector('.back-button').onclick = () => navigateTo('top');
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
        
        // グラフ描画（簡易版）
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
