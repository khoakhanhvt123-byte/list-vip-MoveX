export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'GEMINI_API_KEY chưa được cấu hình trên Vercel.' });
  }

  const { type, imgB64, imgMime, productInfo, blacklistNiches } = req.body;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

  let prompt, temperature;

  if (type === 'tm-check') {
    // ── Bước 1: TM check
    if (!blacklistNiches || blacklistNiches.length === 0) {
      return res.json({ matched: false });
    }
    const listStr = blacklistNiches.map((n, i) => `${i + 1}. ${n}`).join('\n');
    const ctx = productInfo?.productTitle ? `Product title from store: "${productInfo.productTitle}".` : '';
    prompt = `You are a brand/IP identification expert.
${ctx}
Analyze this product image and identify what brand, franchise, character, IP, or niche it belongs to.

Then check if it matches ANY of the following blacklist entries. Use your knowledge to group related things — for example, if the image shows a "Creeper" character, that belongs to "minecraft" which IS on the list.

BLACKLIST:
${listStr}

Rules:
- Return ONLY valid JSON, no markdown.
- matched: true ONLY if the product brand/IP/niche is on the blacklist above.
- matched: false if it is NOT on the blacklist — even if you know it has a trademark.
- The blacklist is the ONLY source of truth for blocking.
- detectedNiche: what brand/IP you identified (always fill this).
- matchedEntry: exact entry from blacklist that matched, or null.

Return exactly one of:
{"matched":false,"detectedNiche":"...","matchedEntry":null}
{"matched":true,"detectedNiche":"...","matchedEntry":"..."}`;
    temperature = 0;

  } else if (type === 'gen-listing') {
    // ── Bước 2: Gen title + tags
    const ctx = productInfo ? `Product name: "${productInfo.productTitle}". Description: "${productInfo.description}".` : '';
    prompt = `You are an expert Etsy SEO copywriter for personalized/POD products.
Analyze this product image and determine its category automatically. ${ctx}
Return ONLY valid JSON (no markdown, no fences):
{"title":"...","tags":["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10","tag11","tag12","tag13"]}
Rules:
- title: max 140 chars, include "personalized" or "custom", top buyer keywords, be specific
- tags: EXACTLY 13 tags, each max 20 chars, no punctuation, mix: product keywords + gift occasions (birthday, anniversary, Christmas, wedding) + recipient (mom, dad, wife, friend) + style/material
- All English`;
    temperature = 0.7;

  } else {
    return res.status(400).json({ error: 'type phải là tm-check hoặc gen-listing' });
  }

  const parts = [{ text: prompt }];
  if (imgB64) parts.push({ inline_data: { mime_type: imgMime || 'image/jpeg', data: imgB64 } });

  try {
    const geminiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature } })
    });

    if (!geminiRes.ok) {
      const e = await geminiRes.json().catch(() => ({}));
      return res.status(502).json({ error: e.error?.message || `Gemini HTTP ${geminiRes.status}` });
    }

    const data = await geminiRes.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return res.json(result);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
