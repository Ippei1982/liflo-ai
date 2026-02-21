// api/gemini.js
// Vercel Serverless Function

export default async function handler(req, res) {
  // 1. CORS
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  // 2. Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // 3. Method check
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const history = Array.isArray(body.history) ? body.history : [];
    const message = typeof body.message === "string" ? body.message : "";
    const systemInstruction =
      typeof body.systemInstruction === "string" ? body.systemInstruction : "";

    if (!message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "API Key not configured" });
    }

    // 環境変数でモデル上書き可。未設定なら安定版を使用
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    const payload = {
      contents: [
        ...history,
        { role: "user", parts: [{ text: message }] }
      ],
      systemInstruction: { parts: [{ text: systemInstruction }] }
    };

    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    const raw = await apiRes.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }

    if (!apiRes.ok) {
      const apiMessage =
        data?.error?.message || `Gemini API Error (${apiRes.status})`;
      throw new Error(apiMessage);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return res.status(200).json({ text });
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: error?.message || "Internal Server Error" });
  }
}
