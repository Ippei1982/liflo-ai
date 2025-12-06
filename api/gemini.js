// api/gemini.js
// Vercel Serverless Function

export default async function handler(req, res) {
    // 1. CORS設定（これがないとブラウザから拒否されることがあります）
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); // すべてのドメインからのアクセスを許可
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // 2. OPTIONSメソッド（プリフライトリクエスト）への即時応答
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 3. POST以外のメソッドは拒否
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { history, message, systemInstruction } = req.body;
        
        // Vercelの設定画面で登録するAPIキーを読み込む
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'API Key not configured' });
        }

        // Gemini APIへのリクエストペイロード作成
        const payload = {
            contents: [
                ...history,
                { role: 'user', parts: [{ text: message }] }
            ],
            systemInstruction: { parts: [{ text: systemInstruction }] }
        };

        // Gemini APIを叩く (モデルは最新のFlashを指定)
        const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!apiRes.ok) {
            const errorData = await apiRes.json();
            throw new Error(errorData.error?.message || 'Gemini API Error');
        }

        const data = await apiRes.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

        return res.status(200).json({ text });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
