// Vercel Serverless Function
export default async function handler(req, res) {
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

        const payload = {
            contents: [
                ...history,
                { role: 'user', parts: [{ text: message }] }
            ],
            systemInstruction: { parts: [{ text: systemInstruction }] }
        };

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