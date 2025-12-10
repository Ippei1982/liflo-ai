/**
 * LIFLO-AI Application Script
 * FINAL STABLE VERSION: Global Error Handling and Goals List Fix
 */

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

// --- Helper Functions ---

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

function showModal({ title, message = '', showInput = false, inputType = 'default', placeholder = '', showCancel = false, isGoalEdit = false, currentGoal = {} }) {
    return new Promise((resolve) => {
        const t = document.getElementById('modal-template').content.cloneNode(true);
        const backdrop = t.getElementById('modal-backdrop');
        const tEl = t.getElementById('modal-title'), cEl = t.getElementById('modal-content');
        const iCon = t.getElementById('modal-input-container'), iEl = t.getElementById('modal-input');
        const gForm = t.getElementById('modal-goal-form'), ok = t.getElementById('modal-ok'), can = t.getElementById('modal-cancel');
        tEl.textContent = title; cEl.innerHTML = message;

        if(showInput){
            if(inputType==='default'){ iCon.classList.remove('hidden'); iEl.placeholder=placeholder; }
            else if(inputType==='goal-form') {
                gForm.classList.remove('hidden');
                
                const statusSelectContainer = document.getElementById('modal-goal-form').querySelector('div:last-child');
                
                if (isGoalEdit && currentGoal.goal) {
                    setTimeout(() => {
                        document.getElementById('goal-input-main').value = getGoalMainText(currentGoal.goal);
                        const catMatch = currentGoal.goal.match(/Cat:(.*?)(?:,|,\s|\)|$)/);
                        const stepMatch = currentGoal.goal.match(/1st:(.*?)(?:,|,\s|\)|$)/);
                        if (catMatch) document.getElementById('goal-input-category').value = catMatch[1].trim();
                        if (stepMatch) document.getElementById('goal-input-step').value = stepMatch[1].trim();
                        document.getElementById('goal-input-status').value = currentGoal.status || ''; 
                    }, 50);
                    if (statusSelectContainer) statusSelectContainer.style.display = 'block';
                } else if (!isGoalEdit) {
                    if (statusSelectContainer) statusSelectContainer.style.display = 'none';
                }
            }
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
async function customPrompt(msg, ph='') { return await showModal({ title: '入力', message: msg, showInput: true, placeholder: ph, showCancel: true }); }

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

function extractLLMData(txt) {
    let c = txt.replace(/```json/g,'').replace(/```/g,'');
    const f = c.indexOf('{'), l = c.lastIndexOf('}');
    if(f!==-1 && l!==-1 && l>f){
        try{ return { text: (c.substring(0,f)+c.substring(l+1)).trim(), data: JSON.parse(c.substring(f,l+1)) }; }catch(e){}
    }
    return { text: c, data: null };
}

// --- Crisis Management Logic ---
function checkCrisisKeywords(text, uiCallback) {
    if (!text) return false;
    const dangerKeywords = [
        '死にたい', '消えたい', '自殺', '死ぬ', '逝きたい',
        '殺したい', '殺す', '刺す', '殴る', '復讐',
        '陥れる', '許さない', '破滅', '死ね', 'おとしいれる'
    ];

    if (dangerKeywords.some(word => text.includes(word))) {
        const warningHtml = `
            <div class="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 shadow-sm">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-2xl">⚠️</span>
                    <span class="font-bold text-lg">AIからのメッセージ</span>
                </div>
                <p class="text-sm font-bold mb-2">入力された内容には、AIが適切に対応できない、または利用規約に抵触する可能性のある表現が含まれています。</p>
                <p class="text-sm mb-3">強いストレスや悩み、またはトラブルを抱えている場合は、AIではなく専門の相談機関や窓口をご利用ください。</p>
                <div class="bg-white p-3 rounded border border-red-100 text-xs text-gray-600">
                    <strong>相談窓口のご案内:</strong>
                    <ul class="list-disc ml-5 mt-1 space-y-1">
                        <li><a href="https://www.inochinodenwa.org/" target="_blank" class="underline text-blue-600">いのちの電話</a></li>
                        <li><a href="https://www.houterasu.or.jp/" target="_blank" class="underline text-blue-600">法テラス</a></li>
                        <li><a href="https://www.mhlw.go.jp/mamorouyokokoro/" target="_blank" class="underline text-blue-600">まもろうよこころ</a></li>
                    </ul>
                </div>
            </div>
        `;
        const area = document.getElementById('record-chat-area');
        if (area && !area.classList.contains('hidden')) {
            addChatMessage(warningHtml, 'bot');
        } else {
            customAlert(warningHtml);
        }
        if (uiCallback) uiCallback();
        return true; 
    }
    return false;
}

// --- 1. Main LLM Logic ---

async function fetchLLM(prompt) {
    let currentContext = "";
    let latestRegoal = null;
    if (State.selectedGoal) {
        const goalRecords = State.userRecords.filter(r => r.goalNo == State.selectedGoal.goalNo).sort((a, b) => new Date(b.date) - new Date(a.date));
        const latestRec = goalRecords.find(r => r.regoalAI);
        if (latestRec) {
            latestRegoal = latestRec.regoalAI;
            currentContext = `【現在の調整課題 (最優先)】: ${latestRegoal}\n(※この課題の続きとして対話してください)`;
        } else {
            const firstStep = State.selectedGoal.goal.split('1st:')[1]?.slice(0, -1) || '不明';
            currentContext = `【初期設定の第一歩】: ${firstStep}\n(※もしユーザーの進捗がこれを越えている場合は、会話内容を優先してください)`;
        }
    }

    const sys = `
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
    
    【★出力生成指示】
    ユーザーの発言に対し、以下の2つの要素を必ず出力してください。

    1. **会話パート（フリートーク）**:
       - OTの視点で、共感・励まし・具体的なアドバイスを行ってください。
       - **重要: Markdownタグ（**太字**など）は一切使用禁止です。プレーンテキストのみで記述してください。**
       - **重要: 文章は長くなりすぎないよう、簡潔に（従来の60%程度の分量に）短くまとめてください。**

    2. **データパート（分析結果）**:
       - 会話パートの後に、分析結果を以下のJSON形式で記述してください。

    JSONフォーマット:
    \`\`\`json
    {
    "challengeAI": 1-7 (AIが独自に判定した数値),
    "skillAI": 1-7 (AIが独自に判定した数値),
    "reasonAI": "『私の見立てでは〜〜です。なぜなら〜〜だからです』という内容を、親しみやすく伝える文章。\n（Markdown禁止、短く簡潔に）",
    "regoalAI": "提案する調整課題。次回の挨拶で『前回の課題は【これ】でしたね！』と引用しやすいよう、『〇〇をやってみる！ 🔥 』や『〇〇を意識する ✨ 』のような、30文字以内の具体的で短いアクションフレーズにする。"
    }
    \`\`\`
    `;
    
    const history = State.currentChat.map(m => ({ role: m.role==='bot'?'model':'user', parts:[{text:m.text}] }));
    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history: history, message: prompt, systemInstruction: sys })
        });
        if (!response.ok) throw new Error('API request failed');
        const data = await response.json();
        return data.text || "";
    } catch (e) {
        console.error(e);
        return "すみません、通信エラーが発生しました。";
    }
}

// --- 2. Goal Consultation LLM Logic (省略) ---

async function fetchGoalConsultLLM(history, userInput) {
    const sys = `
    あなたは「ライフロ」です。ユーザーの「新しい目標設定」をサポートするガイドです。
    
    【現在の状況】
    ユーザーと対話して、以下の3つの情報を確定させようとしています。
    1. **目標**: 何をしたいか（ユーザーの言葉から抽出）
    2. **カテゴリ**: 仕事・キャリア / 健康・運動 / 趣味・教養 / 人間関係 / その他
    3. **最初の一歩**: 具体的なアクション

    【重要：対話ロジック（ループ防止）】
    会話履歴をよく読んで、**既に確認済みの事項を再度質問しないでください。**
    
    1. **カテゴリ確認のルール**:
       - あなたが「カテゴリは〇〇で合っていますか？」と聞き、ユーザーが「はい」「うん」「OK」などで肯定した場合、即座に**「カテゴリ確定」**とみなしてください。
       - **同じ質問（カテゴリ確認）を繰り返さず、すぐに次の「最初の一歩」の話題へ進んでください。**

    【対話の流れ】
    1. **目標が決まっていない時**:
       - 「ジョギングする」等の具体的行動が出たら、即座にそれを目標として受け止め、次のステップへ。
    2. **目標が思いつかない時**:
       - ユーザーが迷っていたら、「寝る前に1行日記」「近所を5分散歩」などの小さな例を提案して誘導する。
    3. **カテゴリの確認**:
       - 推測して確認する（1回だけ）。肯定されたら次へ。
    4. **完了時**:
       - 3つ揃ったら、「では、この内容で確認画面を表示しますね！✨」と案内し、JSONを出力して終了。

    【制約】
    - 質問は1回に1つだけ。
    - Markdown禁止。

    JSONフォーマット:
    \`\`\`json
    {
      "goal": "目標のタイトル",
      "category": "カテゴリ名(確定したもの)",
      "step": "最初の一歩"
    }
    \`\`\`
    `;

    const contents = history.map(m => ({ role: m.role==='bot'?'model':'user', parts:[{text:m.text}] }));
    contents.push({ role: 'user', parts: [{ text: userInput }] });

    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history: contents, message: userInput, systemInstruction: sys })
        });
        if (!response.ok) throw new Error('API request failed');
        const data = await response.json();
        return data.text || "";
    } catch (e) {
        console.error(e);
        return "すみません、通信エラーです。";
    }
}

// --- UI Logic: Goal Consultation (省略) ---

async function startGoalConsultation(targetInputs) {
    const template = document.getElementById('goal-consult-template');
    if (!template) { alert('テンプレートエラー'); return; }

    const clone = template.content.cloneNode(true);
    const backdrop = clone.getElementById('consult-backdrop');
    const logArea = clone.getElementById('consult-chat-area');
    const input = clone.getElementById('consult-input');
    const sendBtn = clone.getElementById('consult-send');
    const closeBtn = clone.getElementById('consult-close');

    input.placeholder = "ここに書き込んでみましょう！✍️";

    document.body.appendChild(backdrop);

    let chatHistory = []; 

    const addMsg = (text, isUser) => {
        const div = document.createElement('div');
        div.className = `flex w-full ${isUser ? 'justify-end' : 'justify-start'}`;
        
        const icon = !isUser ? `<div class="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 shadow border border-gray-200 mr-2"><img src="${SMALL_ICON_URL}" class="w-4/5 h-4/5 object-contain"></div>` : '';
        
        div.innerHTML = `
            ${icon}
            <div class="max-w-[85%] p-3 rounded-lg text-sm shadow-sm ${isUser ? 'bg-emerald-100 text-gray-800' : 'bg-white border border-gray-200 text-gray-800'}">
                ${text.replace(/\n/g, '<br>')}
            </div>
        `;
        logArea.appendChild(div);
        logArea.scrollTop = logArea.scrollHeight;
        
        if(!isUser && text) chatHistory.push({role: 'bot', text: text});
    };

    const examples = [
        "「英語を話せるようになりたい」",
        "「毎朝ウォーキングしたい」",
        "「資格の勉強を始めたい」",
        "「もっと本を読みたい」",
        "「節約して貯金したい」",
        "「野菜中心の生活にしたい」",
        "「部屋の片付けを習慣にしたい」"
    ];
    const shuffled = examples.sort(() => 0.5 - Math.random());
    const ex1 = shuffled[0];
    const ex2 = shuffled[1];

    addMsg(`こんにちは！✨\nどんな目標を立てたいですか？\n${ex1} や ${ex2} など、なんとなくでも大丈夫ですよ！🌱\n（もし思いつかなければ「わからない」と教えてくださいね！）`, false);

    const handleSend = async () => {
        const txt = input.value.trim();
        if(!txt) return;

        const resetBtn = () => { sendBtn.disabled = false; sendBtn.textContent = '送信'; };
        if(checkCrisisKeywords(txt, resetBtn)) {
            addMsg(`<span class="font-bold text-red-600">⚠️ 適切な対応ができない表現が含まれているため、中断しました。<br>専門機関へご相談ください。</span>`, false);
            return;
        }

        input.value = '';
        addMsg(txt, true);
        sendBtn.disabled = true; sendBtn.textContent = '...';
        
        const resRaw = await fetchGoalConsultLLM(chatHistory, txt);
        const { text, data } = extractLLMData(resRaw);
        
        if(text) addMsg(text, false);

        if(data) {
            setTimeout(async () => {
                document.body.removeChild(backdrop);

                await customAlert(`
                    <div class="text-center">
                        <p class="font-bold text-emerald-600 mb-2">この目標で登録しますか？✨</p>
                        <div class="text-left text-sm bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-2">
                            <p><strong>🎯 目標:</strong> ${data.goal}</p>
                            <p><strong>📂 分野:</strong> ${data.category}</p>
                            <p><strong>👣 一歩:</strong> ${data.step}</p>
                        </div>
                        <p class="text-xs text-gray-500 mt-3">OKを押すとフォームに自動入力されます。</p>
                    </div>
                `);
                
                if(targetInputs.main) targetInputs.main.value = data.goal;
                if(targetInputs.cat) targetInputs.cat.value = data.category;
                if(targetInputs.step) targetInputs.step.value = data.step;
                
            }, 800);
        } else {
            chatHistory.push({role: 'user', text: txt});
        }
        
        sendBtn.disabled = false; sendBtn.textContent = '送信';
        input.focus();
    };

    sendBtn.onclick = handleSend;
    closeBtn.onclick = () => document.body.removeChild(backdrop);
    input.onkeypress = (e) => { if(e.key === 'Enter') handleSend(); };
    setTimeout(() => input.focus(), 100);
}


// --- Render & Init Functions ---

function render() {
    // ★グローバルエラーハンドリングの強化
    try {
        appDiv.innerHTML = '';
        let id = 'login-template';
        if(State.view==='top') id='top-menu-template';
        else if(State.view==='goals') id='goal-management-template';
        else if(State.view==='record') id='record-input-template';
        else if(State.view==='review') id='review-template';
        else if(State.view==='theory') id='theory-template';
        
        // ★ HTMLテンプレートの存在チェック
        const template = document.getElementById(id);
        if (!template) {
             throw new Error(`Template not found: ${id}`);
        }
        
        appDiv.appendChild(template.content.cloneNode(true));
        
        // 各ビューの初期化
        if(State.view==='login') initLogin();
        else if(State.view==='top') initTop();
        else if(State.view==='goals') initGoals();
        else if(State.view==='record') initRecord();
        else if(State.view==='review') initReview();
        else if(State.view==='theory') initTheoryPage();
    } catch (error) {
        console.error("Render Critical Error:", error);
        // ログイン画面の表示を試みる (無限ループ防止のため、State.viewが'login'になる前の状態でのみ再帰を許容)
        if (State.view !== 'login' && !appDiv.querySelector('#login-button')) {
             State.view = 'login';
             render();
        } else {
             // ログイン画面でも失敗した場合
             appDiv.innerHTML = '<div class="text-center p-10 text-red-600">初期化中に致命的なエラーが発生しました。アプリをリロードしてください。</div>';
        }
    }
}

function navigateTo(v, d={}) {
    window.scrollTo(0, 0);
    if(window.flowChartInstance){ window.flowChartInstance.destroy(); window.flowChartInstance=null; }
    if(v==='record' && State.view!=='record'){ State.currentChat=[]; State.recordData=null; State.pendingData=null; }
    if(d.goal) State.selectedGoal=d.goal;
    State.view=v; render();
}

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

function initLogin() {
    const loginForm = document.getElementById('login-form');
    const loginBtn = document.getElementById('login-button');
    const regBtn = document.getElementById('register-button');
    const userIdInput = document.getElementById('userID');
    const userNameInput = document.getElementById('userName');
    
    // ★追加機能：同意チェックボックスの取得
    const termsContainer = document.querySelector('#terms-container'); 
    const termsCheck = document.querySelector('#terms-check');
    const termsCheckExist = termsContainer && termsCheck; 

    // 初回のみ表示ロジック
    if (termsCheckExist && localStorage.getItem('LIFLO_TERMS_AGREED') === 'true') {
        termsContainer.style.display = 'none';
        termsCheck.checked = true; // 内部的にチェック済みに
    } else if (termsCheckExist) {
        termsContainer.style.display = 'block'; 
        termsCheck.checked = false;
    }

    if (!userIdInput || !userNameInput) { customAlert('【システムエラー】\nHTML内の入力欄が見つかりません。'); return; }
    
    const auth = async(act) => {
        let uid = userIdInput.value.trim();
        const nm = userNameInput.value.trim();
        if(!uid || !nm){ customAlert('ニックネームと認証番号(ID)を入力してください'); return; }
        
        // 新規登録時の同意チェック必須
        if (act === 'register' && termsCheckExist && !termsCheck.checked) {
            customAlert('利用を開始するには、免責事項への同意が必要です。');
            return;
        }
        // ログイン時は、チェックボックスが表示されていればチェックを求める
        if (act === 'auth' && termsCheckExist && termsContainer.style.display !== 'none' && !termsCheck.checked) {
             customAlert('続行するには、免責事項への同意が必要です。');
             return;
        }

        uid = parseInt(uid, 10).toString();
        const targetBtn = act === 'auth' ? loginBtn : regBtn;
        const originalText = targetBtn ? targetBtn.textContent : '';

        if(targetBtn) { 
            targetBtn.textContent = '通信中... 🔄'; 
            targetBtn.disabled = true; 
            targetBtn.classList.add('opacity-70', 'cursor-not-allowed'); 
        }

        try {
            const r = await fetchGAS('POST', { action:act, userID:uid, userName:nm });
            if(r.status === 'success'){
                // 成功時に同意フラグを記録
                if (termsCheckExist && termsCheck.checked) {
                    localStorage.setItem('LIFLO_TERMS_AGREED', 'true');
                }
                State.userID = uid; State.userName = nm;
                if(targetBtn) targetBtn.textContent = '成功！ 🎉';
                await customAlert(`<div class="text-center"><div class="flex justify-center mb-2"><img src="https://i.gyazo.com/611879904819fa76fa1d05bc9f6ce711.png" alt="Success" class="w-40 object-contain"></div><p class="font-bold text-lg">ログインしました！</p></div>`);
                await fetchUserData(); navigateTo('top');
            } else {
                customAlert(`ログイン失敗 😓 \n${r.message || 'IDまたはニックネームを確認してください'}`);
                if(targetBtn) { targetBtn.textContent = originalText; targetBtn.disabled = false; targetBtn.classList.remove('opacity-70', 'cursor-not-allowed'); }
            }
        } catch (error) {
            console.error(error); customAlert(`エラーが発生しました:\n${error.message}`);
            if(targetBtn) { targetBtn.textContent = originalText; targetBtn.disabled = false; targetBtn.classList.remove('opacity-70', 'cursor-not-allowed'); }
        }
    };

    if (loginForm) { loginForm.addEventListener('submit', (e) => { e.preventDefault(); auth('auth'); }); }
    else if(loginBtn) { loginBtn.onclick = (e) => { e.preventDefault(); auth('auth'); }; }
    
    if (regBtn) { 
        regBtn.onclick = (e) => { 
            e.preventDefault();
            const uid = userIdInput.value.trim();
            if ((uid.startsWith('16') || uid.startsWith('26')) && uid.length === 6) {
                customAlert('【登録エラー】<br>指定された番号（' + uid + '）は研究参加者専用です。<br>モニター登録には使用できません。<br>桁数を変えるか、別の番号を使用してください。');
                return;
            }
            auth('register'); 
        }; 
    }
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
                // ★修正：論理削除のID判定ロジック
                if (rawG >= 30000) { status = '削除'; realID = rawG - 30000; }
                else if (rawG >= 20000) { status = '中止'; realID = rawG - 20000; }
                else if (rawG >= 10000) { status = '達成'; realID = rawG - 10000; }
                
                const existing = gm.get(realID);
                const firstDate = existing ? existing.startDate : d.date;
                gm.set(realID, { goalNo: realID, goal: d.goal, startDate: firstDate, lastDate: d.date, status: status });
            }
        });
        
        // ★修正：目標リストのフィルタリング（削除されたものを除外）
        State.activeGoals = Array.from(gm.values())
            .filter(g => g.status !== '削除')
            .sort((a,b)=>a.goalNo-b.goalNo);

        let mx = 0; 
        r.userRecords.forEach(d=>{ 
            let g = parseInt(d.goalNo); 
            if(g >= 30000) g = g % 10000;
            else if(g >= 20000) g = g % 10000;
            else if(g >= 10000) g = g % 10000;
            if(g > mx && g < 9999) mx = g; 
        });
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
            if(action === 'record' && State.activeGoals.filter(g => !g.status).length === 0) { 
                customAlert('進行中の目標がありません。目標管理画面で新しい目標を登録するか、履歴から目標を「再開」してください。'); 
                navigateTo('goals'); 
            } else { 
                navigateTo(action); 
            }
        });
    });
    
    const uidStr = State.userID.toString();
    if (uidStr.startsWith('26') && uidStr.length === 6) {
        const theoryBtn = document.querySelector('[data-action="theory"]');
        if (theoryBtn) theoryBtn.style.display = 'none';
    }
}

function initGoals() {
    const lst = document.getElementById('goal-list');
    let currentTab = 'active';
    const tabActive = document.getElementById('tab-active');
    const tabHistory = document.getElementById('tab-history');
    
    // タブ要素のイベント設定
    if(tabActive && tabHistory) {
        const baseTabClass = "flex-1 px-4 py-3 text-sm font-bold transition-colors text-center cursor-pointer";
        const activeStyle = "text-emerald-600 border-b-4 border-emerald-600 bg-white";
        const historyStyle = "text-orange-500 border-b-4 border-orange-500 bg-white";
        const inactiveStyle = "text-gray-400 hover:text-gray-600 border-b border-gray-200 bg-gray-50";
        
        const switchTab = (tab) => {
            currentTab = tab;
            if(tab === 'active') { 
                tabActive.className = `${baseTabClass} ${activeStyle}`; 
                tabHistory.className = `${baseTabClass} ${inactiveStyle}`; 
            } else { 
                tabActive.className = `${baseTabClass} ${inactiveStyle}`; 
                tabHistory.className = `${baseTabClass} ${historyStyle}`; 
            }
            ren();
        };
        tabActive.onclick = () => switchTab('active'); 
        tabHistory.onclick = () => switchTab('history');
        switchTab('active');
    }

    const ren = () => {
        if(!lst) return;
        lst.innerHTML = '';
        
        // 表示対象の目標をフィルタリング
        const targets = State.activeGoals.filter(g => { 
            if (currentTab === 'active') return !g.status; 
            else return g.status === '達成' || g.status === '中止';
        });

        if(targets.length === 0) { 
            lst.innerHTML = `<p class="text-center text-gray-400 mt-10">${currentTab === 'active' ? '進行中の目標はありません 🌱' : '履歴はありません 📜'}</p>`; 
        }

        targets.forEach(g => {
            try { 
                const template = document.getElementById('goal-card-template');
                if(!template) return;
                const t = template.content.cloneNode(true);
                const fullTitle = g.goal || '';
                const titleOnly = fullTitle.split(' (')[0];
                const catMatch = fullTitle.match(/Cat:(.*?)(?:,|,\s|\)|$)/);
                const stepMatch = fullTitle.match(/1st:(.*?)(?:,|,\s|\)|$)/);
                const category = catMatch ? catMatch[1].trim() : '';
                const step = stepMatch ? stepMatch[1].trim() : '';
                
                // 目標カード内の要素を安全に取得
                const titleEl = t.querySelector('[data-field="goal-title"]');
                const cardContainer = t.querySelector('.goal-card');
                const catTag = t.querySelector('[data-field="goal-cat-tag"]');
                const dateTag = t.querySelector('[data-field="goal-date-tag"]');
                const stepEl = t.querySelector('[data-field="goal-step"]');
                const stepText = t.querySelector('.goal-step-text');
                const btnContainer = t.querySelector('.button-container');


                // 1. タイトルとカードのスタイリング
                if(currentTab === 'history') {
                    if (g.status === '達成') {
                        if (cardContainer) cardContainer.classList.add('bg-yellow-50', 'border-yellow-200');
                        if (titleEl) titleEl.innerHTML = `<span class="text-yellow-600 mr-1">🏆 達成</span> ${titleOnly}`;
                    } else if (g.status === '中止') {
                        if (cardContainer) cardContainer.classList.add('bg-gray-100', 'border-gray-200');
                        if (titleEl) {
                            titleEl.classList.add('text-gray-500');
                            titleEl.innerHTML = `<span class="text-gray-400 mr-1">⏹️ 中止</span> <span class="line-through">${titleOnly}</span>`;
                        }
                    }
                } else {
                    if (titleEl) titleEl.textContent = `[#${g.goalNo}] ${titleOnly}`;
                }

                // 2. カテゴリタグ
                if (category && catTag) {
                    let colorClass = 'bg-purple-50 text-purple-700 border-purple-200'; let icon = '📂';
                    if (category.includes('仕事') || category.includes('キャリア')) { colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200'; icon = '💼'; }
                    else if (category.includes('健康') || category.includes('運動')) { colorClass = 'bg-orange-50 text-orange-700 border-orange-200'; icon = '🏃'; }
                    else if (category.includes('趣味') || category.includes('教養')) { colorClass = 'bg-blue-50 text-blue-700 border-blue-200'; icon = '📚'; }
                    else if (category.includes('人間関係')) { colorClass = 'bg-pink-50 text-pink-700 border-pink-200'; icon = '🤝'; }
                    catTag.textContent = `${icon} ${category}`;
                    catTag.className = `inline-flex items-center text-xs font-bold px-2 py-1 rounded border ${colorClass}`;
                    catTag.classList.remove('hidden');
                    if(g.status === '中止') catTag.className = `inline-flex items-center text-xs font-bold px-2 py-1 rounded border bg-gray-200 text-gray-500 border-gray-300`;
                }

                // 3. 日付表示
                if (g.startDate && dateTag) {
                    const startStr = formatDateForDisplay(g.startDate).split(' ')[0];
                    if (currentTab === 'history') { 
                        const endStr = g.lastDate ? formatDateForDisplay(g.lastDate).split(' ')[0] : '???'; 
                        dateTag.textContent = `📅 ${startStr} ～ ${endStr}`; 
                    } else { 
                        dateTag.textContent = `📅 登録: ${startStr}`; 
                    }
                    dateTag.classList.remove('hidden');
                }

                // 4. 最初の一歩表示
                if (step && stepEl && stepText) { 
                    stepText.textContent = step; 
                    stepEl.classList.remove('hidden');
                    if(g.status === '中止') stepEl.classList.add('opacity-50');
                }

                // 5. ボタン生成エリア
                if(btnContainer) {
                    btnContainer.innerHTML = '';
                    
                    // 編集ボタンの共通処理
                    const handleEdit = async () => {
                        const modalPromise = showModal({ title: '目標の編集', showInput: true, inputType: 'goal-form', showCancel: true, isGoalEdit: true, currentGoal: g });
                        const result = await modalPromise;
                        if(!result) return;
                        
                        const checkText = `${result.goal} ${result.step}`;
                        if(checkCrisisKeywords(checkText)) return;

                        let currentStatusOffset = 0;
                        if(result.status === '達成') currentStatusOffset = 10000;
                        else if(result.status === '中止') currentStatusOffset = 20000;

                        const saveID = currentStatusOffset + g.goalNo;
                        const newGoalString = `${result.goal} (Cat:${result.category}, 1st:${result.step})`;
                        
                        await fetchGAS('POST', { action: 'saveData', date: getFormattedDate(), userID: State.userID, userName: State.userName, goalNo: saveID, goal: newGoalString });
                        customAlert('更新しました！✨'); await fetchUserData(); ren();
                    };

                    // ヘルパー関数
                    const createBtn = (text, colorClass, onClick, isGrow = false) => {
                        const b = document.createElement('button');
                        b.className = `py-2 px-3 text-sm rounded-lg font-bold ${colorClass} ${isGrow ? 'flex-grow' : ''}`;
                        b.textContent = text;
                        b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onClick(); };
                        return b;
                    };
                    const createIconBtn = (icon, colorClass, onClick) => {
                        const b = document.createElement('button');
                        b.className = `p-3 text-sm rounded-lg font-bold ${colorClass}`;
                        b.textContent = icon;
                        b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onClick(); };
                        return b;
                    };

                    if (currentTab === 'active') {
                        // 進行中タブのボタン
                        const recBtn = createBtn("今日の記録 ✍️", "bg-teal-100 text-teal-700 hover:bg-teal-200", () => navigateTo('record', {goal:g}), true);
                        const achBtn = createBtn("達成 🎉", "bg-yellow-100 text-yellow-700 hover:bg-yellow-200", () => handleChangeStatus(g, '達成', 10000));
                        const stpBtn = createBtn("中止 ⏹️", "bg-gray-100 text-gray-700 hover:bg-gray-200", () => handleChangeStatus(g, '中止', 20000));
                        const delBtn = createIconBtn("🗑️", "bg-red-100 text-red-700 hover:bg-red-200", () => handleChangeStatus(g, '削除', 30000));
                        const editBtn = createIconBtn("✏️", "bg-emerald-100 text-emerald-700 hover:bg-emerald-200", handleEdit); 

                        btnContainer.append(recBtn, achBtn, stpBtn, delBtn, editBtn);
                    
                    } else if (currentTab === 'history') {
                        // 履歴タブのボタン
                        const restoreBtn = createBtn("再開する 🔄", "bg-emerald-100 text-emerald-700 hover:bg-emerald-200", () => handleChangeStatus(g, '再開', 0), true);
                        const delBtn = createBtn("完全に削除 🗑️", "bg-red-100 text-red-700 hover:bg-red-200", () => handleChangeStatus(g, '削除', 30000));
                        const editBtn = createIconBtn("✏️", "bg-emerald-100 text-emerald-700 hover:bg-emerald-200", handleEdit); 

                        btnContainer.append(restoreBtn, delBtn, editBtn);
                    }
                }
                lst.appendChild(t);
            } catch (e) {
                // 個別のカード生成エラーを報告しつつ、処理は継続
                console.error(`Error rendering goal card for #${g.goalNo}:`, e);
            }
        });
    };

    const handleChangeStatus = async (goalObj, statusLabel, offsetID) => {
        let msg = '';
        if (statusLabel === '削除') { msg = `<span class="text-red-600 font-bold">本当に削除しますか？</span><br>画面から消えますが、データは研究用に保存されます。`; } 
        else if (statusLabel === '再開') { msg = `「${getGoalMainText(goalObj.goal)}」を再開しますか？<br>意気込みを一言どうぞ！`; } 
        else { msg = `${statusLabel}の理由や、今の気持ちを一言どうぞ：`; }

        const reason = await customPrompt(msg);
        if (reason === null) return; 

        if(checkCrisisKeywords(reason)) return;

        const saveID = offsetID + goalObj.goalNo;
        await fetchGAS('POST', { 
            action: 'saveData', 
            date: getFormattedDate(), 
            userID: State.userID, 
            userName: State.userName, 
            goalNo: saveID, 
            goal: goalObj.goal, 
            reasonU: reason 
        });
        
        let doneMsg = '更新しました ✨';
        if (statusLabel === '削除') doneMsg = '削除しました 🗑️';
        if (statusLabel === '再開') doneMsg = 'おかえりなさい！再開しました 🚀';
        
        customAlert(doneMsg); await fetchUserData(); ren();
    };

    const addBtn = document.getElementById('add-goal-button');
    if(addBtn) {
        addBtn.onclick = async() => {
            const modalPromise = showModal({ title:'目標登録', showInput:true, inputType:'goal-form', showCancel:true, isGoalEdit: false });
            
            setTimeout(() => {
                const formArea = document.getElementById('modal-goal-form');
                const uidStr = State.userID.toString();
                const isControl = uidStr.startsWith('26') && uidStr.length === 6;
                if(formArea && !document.getElementById('ai-consult-btn') && !isControl) {
                    const btn = document.createElement('button');
                    btn.id = 'ai-consult-btn';
                    btn.className = "w-full mb-4 py-2 bg-emerald-100 text-emerald-700 font-bold rounded-lg hover:bg-emerald-200 transition flex items-center justify-center gap-2";
                    btn.innerHTML = "<span>🤖</span> ライフロと相談して決める";
                    btn.onclick = (e) => {
                        e.preventDefault();
                        customAlert('目標相談機能は開発中です。フォームに直接入力してください。');
                    };
                    const inputFormContainer = document.getElementById('modal-goal-form').parentNode;
                    inputFormContainer.insertBefore(btn, document.getElementById('modal-goal-form'));
                }
            }, 50);

            const i = await modalPromise;
            if(!i) return;

            const checkText = `${i.goal} ${i.step}`;
            if(checkCrisisKeywords(checkText)) return;

            const fg = `${i.goal} (Cat:${i.category}, 1st:${i.step})`;
            await fetchGAS('POST', { action:'saveData', date:getFormattedDate(), userID:State.userID, userName:State.userName, goalNo:State.nextGoalNo, goal:fg });
            customAlert('登録しました'); await fetchUserData(); ren();
        };
    }
    const backBtn = document.querySelector('.back-button');
    if(backBtn) backBtn.onclick = () => navigateTo('top');
    // initGoalsの最後にレンダリングを実行
    if (tabActive) switchTab('active'); 
    else ren(); // タブがない場合は直接レンダリング
}

function initRecord() {
    const activeGoalsOnly = State.activeGoals.filter(g => !g.status); 

    if(activeGoalsOnly.length === 0){
        customAlert('記録できる進行中の目標がありません。目標管理画面で新しい目標を登録するか、履歴から目標を「再開」してください。');
        navigateTo('goals');
        return;
    }
    
    if(!State.selectedGoal || State.selectedGoal.status) State.selectedGoal = activeGoalsOnly[0];
    const sel = document.getElementById('record-goal-select');
    sel.innerHTML = activeGoalsOnly.map(g => `<option value="${g.goalNo}" ${State.selectedGoal?.goalNo==g.goalNo?'selected':''}>#${g.goalNo} ${getGoalMainText(g.goal).substr(0,20)}...</option>`).join('');
    
    sel.onchange = (e) => {
        const g = activeGoalsOnly.find(item => item.goalNo == e.target.value);
        if (g) { State.currentChat = []; State.recordData = null; State.pendingData = null; navigateTo('record', {goal: g}); }
    };
    
    const uidStr = State.userID.toString();
    const isControl = uidStr.startsWith('26') && uidStr.length === 6;

    const banner = document.getElementById('last-regoal-banner');
    const bannerText = document.getElementById('last-regoal-text');
    if(banner) banner.classList.add('hidden');

    if (!isControl) {
        setTimeout(() => {
            const goalRecords = State.userRecords.filter(r => r.goalNo == State.selectedGoal?.goalNo).sort((a, b) => new Date(b.date) - new Date(a.date));
            const lastRegoal = goalRecords.find(r => r.regoalAI)?.regoalAI;
            if (lastRegoal && banner && bannerText) { bannerText.textContent = lastRegoal; banner.classList.remove('hidden'); }
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
    
    if (isControl) {
        initBtn.textContent = '記録を送信する 📤';
    } else {
        initBtn.textContent = '記録してライフロと相談する 🚀';
    }

    // --- Updated: Display Control Logic ---
    const handleAIResponse = (raw, isFollowUp = false) => {
        const { text, data } = extractLLMData(raw);
        let firstMsgElement = null;

        if (isControl) {
            firstMsgElement = addChatMessage("記録を受け付けました。<br>継続して取り組みましょう。 🌱", 'bot');
            if (data) { State.pendingData = data; }
            const addChat = document.getElementById('additional-chat-container');
            if(addChat) addChat.classList.add('hidden');
            const guide = document.getElementById('save-recommend-text');
            if(guide) guide.style.display = 'none';
        } else {
            // 1. Text (Conversation): Always show, clean Markdown
            if(text) { 
                const cleanText = text.replace(/\*\*/g, '').replace(/__/g, '').replace(/\n/g, '<br>');
                firstMsgElement = addChatMessage(cleanText, 'bot'); 
            }

            // 2. Data: Always update state, selectively show bubbles
            if(data){
                State.pendingData = data; // Keep latest data for saving

                // Show Analysis Bubble ONLY if NOT follow-up (First turn only)
                if (!isFollowUp) {
                    const analysisHtml = `<div class="border-b border-blue-200 pb-2 mb-2"><div class="font-bold text-orange-600"> 📊 ライフロの見立て (挑戦${data.challengeAI}/能力${data.skillAI})</div><div class="font-bold text-blue-600 mt-1"> 🤔 ライフロの分析</div></div><div class="text-gray-700">${data.reasonAI}</div>`;
                    const analysisMsg = addChatMessage(analysisHtml, 'bot', 'analysis');
                    if (!firstMsgElement) firstMsgElement = analysisMsg;
                }

                // Show Regoal Bubble ALWAYS (It updates with conversation)
                const goalHtml = `<div class="font-bold text-green-600 mb-1 border-b border-green-200 pb-1"> 🚩 今後の目標／課題</div>${data.regoalAI}`;
                addChatMessage(goalHtml, 'bot', 'regoal');
            }
        }
        
        if (firstMsgElement) { firstMsgElement.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    };
    
    form.onsubmit = async(e) => {
        e.preventDefault();
        const c = document.querySelector('input[name="challengeU"]:checked')?.value;
        const s = document.querySelector('input[name="skillU"]:checked')?.value;
        const r = document.getElementById('reasonU').value;
        if(!c || !s){ customAlert('評価を選択してください'); return; }

        const combinedText = `${getGoalMainText(State.selectedGoal.goal)} ${r}`;
        const resetBtn = () => {
             initBtn.disabled = false;
             initBtn.textContent = isControl ? '記録を送信する 📤' : '記録してライフロと相談する 🚀';
        };

        if(checkCrisisKeywords(combinedText, resetBtn)) return; 
        
        initBtn.disabled=true; 
        initBtn.textContent = isControl ? '送信中...' : 'ライフロAI思考中...';
        
        State.recordData = { challengeU:c, skillU:s, reasonU:r };
        const p = `目標: ${getGoalMainText(State.selectedGoal.goal)}\n自己評価: 挑戦${c}/能力${s}\n理由: ${r}`;
        addChatMessage(p.replace(/\n/g, '<br>'), 'user');
        
        // Pass false for first turn
        const res = await fetchLLM(p);
        handleAIResponse(res, false);
        
        form.classList.add('hidden');
        chatArea.classList.remove('hidden');
    };

    sendBtn.onclick = async() => {
        const txt = chatInput.value.trim();
        if(!txt) return;
        
        const resetBtn = () => { sendBtn.disabled = false; sendBtn.textContent = '送信'; };
        if(checkCrisisKeywords(txt, resetBtn)) return;

        chatInput.value='';
        sendBtn.disabled=true; sendBtn.textContent='...';
        
        addChatMessage(txt.replace(/\n/g, '<br>'), 'user');
        State.recordData.reasonU += `\n(追記) ${txt}`;
        
        // Pass true for follow-up turns
        const res = await fetchLLM(txt);
        handleAIResponse(res, true);
        
        sendBtn.disabled=false; sendBtn.textContent='送信';
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
    const backBtn = appDiv.querySelector('.back-button');
    if(backBtn) backBtn.addEventListener('click', () => navigateTo('top'));
}

let flowChartInstance = null;
function initReview() {
    const sel = document.getElementById('review-goal-selector');
    const box = document.getElementById('record-details-container');
    const tit = document.getElementById('chart-title');
    
    // 振り返り対象の目標: 削除フラグがない目標すべて（進行中、達成、中止）
    const reviewableGoals = State.activeGoals.filter(g => 
        g.status !== '削除' && State.userRecords.some(r => r.goalNo == g.goalNo && r.challengeU)
    );

    if(reviewableGoals.length===0){ box.innerHTML='<p class="text-gray-500 p-4">記録なし</p>'; return; }
    
    // 選択リストの表示
    sel.innerHTML = reviewableGoals.map(g => {
        let prefix = '';
        if (g.status === '達成') prefix = '🏆 ';
        else if (g.status === '中止') prefix = '⏹️ ';
        return `<option value="${g.goalNo}">${prefix}#${g.goalNo} ${getGoalMainText(g.goal).substr(0,15)}...</option>`;
    }).join('');
    
    const uidStr = State.userID.toString();
    const isControl = uidStr.startsWith('26') && uidStr.length === 6;
    
    if (isControl) {
        const chartCard = document.getElementById('review-chart-card');
        if(chartCard) chartCard.style.display = 'none';
    }

    const load = (gn) => {
        const recs = State.userRecords.filter(r => 
            r.goalNo == gn && r.challengeU
        ).sort((a,b)=>new Date(a.date)-new Date(b.date));
        
        const goalName = reviewableGoals.find(t=>t.goalNo==gn)?.goal||'';
        if(tit) tit.textContent = `${getGoalMainText(goalName)} のCSバランス推移`;
        const ctx = document.getElementById('flowChart').getContext('2d');
        if(flowChartInstance) { flowChartInstance.destroy(); }
        const uPts = []; const aPts = [];
        recs.forEach((r, idx) => {
            uPts.push({x:parseFloat(r.skillU), y:parseFloat(r.challengeU)});
            if(r.skillAI){
                let ax = parseFloat(r.skillAI); let ay = parseFloat(r.challengeAI);
                if(ax === parseFloat(r.skillU) && ay === parseFloat(r.challengeU)) { ax += 0.15; ay += 0.15; }
                aPts.push({x:ax, y:ay});
            }
        });
        const uLast = uPts.length > 0 ? [uPts[uPts.length-1]] : [];
        const aLast = aPts.length > 0 ? [aPts[aPts.length-1]] : [];
        const isMobile = window.innerWidth < 768;
        const fontSize = isMobile ? 12 : 14;
        flowChartInstance = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [
                    { label: 'あなた(実線)', data: uPts, borderColor: 'rgba(16, 185, 129, 0.4)', backgroundColor: 'rgba(16, 185, 129, 0.4)', showLine: true, pointRadius: 3, borderWidth: 2 },
                    { label: 'ライフロ評価(点線)', data: aPts, borderColor: 'rgba(249, 115, 22, 0.6)', backgroundColor: 'rgba(249, 115, 22, 0.4)', showLine: true, borderDash: [5, 5], pointRadius: 3, borderWidth: 2 },
                    { label: '最新のあなた(丸)', data: uLast, borderColor: 'rgb(5, 150, 105)', backgroundColor: 'rgb(5, 150, 105)', pointRadius: 8, pointHoverRadius: 10, pointStyle: 'circle' },
                    { label: '最新ライフロ(星)', data: aLast, borderColor: 'rgb(255, 152, 0)', backgroundColor: 'rgba(255, 152, 0, 0.5)', pointRadius: 10, pointHoverRadius: 12, pointStyle: 'star' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { x: { min: 1, max: 7, title: { display: true, text: '能力レベル', font: { size: fontSize, weight: 'bold' } } }, y: { min: 1, max: 7, title: { display: true, text: '挑戦レベル', font: { size: fontSize, weight: 'bold' } } } },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(context) { let label = context.dataset.label || ''; if (label) label += ': '; if (context.parsed.x !== null) { const x = Math.round(context.parsed.x); const y = Math.round(context.parsed.y); label += `(挑戦${y}, 能力${x})`; } return label; } } } },
                beforeDraw: (chart) => {
                    const { ctx, chartArea: { top, bottom, left, right }, scales: { x, y } } = chart;
                    const cx = x.getPixelForValue(4); const cy = y.getPixelForValue(4);
                    ctx.clearRect(left, top, right - left, bottom - top);
                    const q = [ { c: 'rgba(74, 222, 128, 0.2)', x: cx, y: top, w: right-cx, h: cy-top, t: 'フロー' }, { c: 'rgba(252, 165, 165, 0.2)', x: left, y: top, w: cx-left, h: cy-top, t: '不安' }, { c: 'rgba(253, 224, 71, 0.2)', x: cx, y: cy, w: right-cx, h: bottom-cy, t: '退屈' }, { c: 'rgba(199, 210, 254, 0.2)', x: left, y: cy, w: cx-left, h: bottom-cy, t: '無関心' } ];
                    q.forEach(i => { ctx.fillStyle = i.c; ctx.fillRect(i.x, i.y, i.w, i.h); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.font = isMobile ? '10px Inter' : '14px Inter'; ctx.fillText(i.t, i.x + i.w/2 - 10, i.y + i.h/2); });
                }
            }
        });
        box.innerHTML='';
        [...recs].reverse().forEach(r => {
            const aiSection = (!isControl && r.skillAI && r.challengeAI) ? `<div class="text-sm mt-2"><div class="flex items-center gap-2 mb-1"><div class="w-8 h-8 rounded-full border border-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0 bg-white"><img src="${SMALL_ICON_URL}" alt="LIFLO" class="w-full h-full object-contain"></div><span class="font-bold text-gray-700">ライフロの評価</span><span class="font-bold text-orange-600">挑戦${r.challengeAI} / 能力${r.skillAI}</span></div><div class="text-gray-600 text-xs pl-10 bg-orange-50 p-2 rounded ml-1">${r.reasonAI || 'コメントなし'}</div></div>` : '';
            const regoalSection = (!isControl && r.regoalAI) ? `<div class="text-sm mt-2 pt-2 border-t border-gray-100"><div class="font-bold text-emerald-700 mb-1"> 🏁 今後の目標／課題</div><div class="bg-emerald-50 p-2 rounded text-emerald-800 text-xs font-medium">${r.regoalAI}</div></div>` : '';
            const card = document.createElement('div');
            card.className = 'bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-3';
            card.innerHTML = `<div class="text-xs font-bold text-gray-500 border-b border-gray-100 pb-1">${formatDateForDisplay(r.date)}</div><div class="text-sm"><div class="flex items-center gap-2 mb-1"><div class="w-8 h-8 rounded-full border border-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0 bg-white"><img src="${USER_ICON_URL}" alt="User" class="w-4/5 h-4/5 object-contain p-1"></div><span class="font-bold text-gray-700">あなたの評価</span><span class="font-bold text-emerald-600">挑戦${r.challengeU} / 能力${r.skillU}</span></div><div class="text-gray-600 text-xs pl-10 ml-1">${r.reasonU || '理由なし'}</div></div>${aiSection}${regoalSection}`;
            box.appendChild(card);
        });
    };
    load(reviewableGoals[0].goalNo);
    sel.addEventListener('change', (e) => load(e.target.value));
    const backBtnTop = appDiv.querySelector('.back-button');
    if(backBtnTop) backBtnTop.addEventListener('click', () => navigateTo('top'));
    appDiv.querySelectorAll('.back-button').forEach(btn => btn.addEventListener('click', () => navigateTo('top')));
}

function initTheoryPage() { appDiv.querySelector('.back-button').addEventListener('click', () => navigateTo('top')); }

window.onload = function() { 
    // ★onload時にデータ取得と描画をチェーンで実行 (初期化の安定化)
    fetchUserData().then(() => render()); 
};

appDiv.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (t && !t.getAttribute('onclick')) navigateTo(t.dataset.action);
});
