export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'GEMINI_API_KEY chưa được cấu hình trên Vercel.' });
  }

  const { type, imgB64, imgMime, productInfo, blacklistNiches } = req.body;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${key}`;

  let prompt, temperature;

  if (type === 'tm-check') {
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

  } else if (type === 'gen-personalize') {
    const ctx = productInfo ? `Product name: "${productInfo.productTitle}". Store description: "${productInfo.description}".` : '';
    prompt = `You are an Etsy listing expert. Analyze this product image and generate the Personalization section for an Etsy listing.

${ctx}

═══ HARD ETSY PLATFORM LIMITS — NEVER EXCEED ═══
- MAX 5 fields total (Etsy platform limit — this is absolute)
- Field title: max 45 characters
- List field: max 30 options
- Text box instruction: max 120 characters
- Text box character limit: 1–1024 (default 256)

═══ CRITICAL RULE: CONSOLIDATION OVER COMPLETENESS ═══
When a product has many option groups (branch → division → logo → rank → rank tier → name),
you MUST consolidate into ≤5 fields using these strategies:

STRATEGY A — Merge dependent options into ONE text field:
  Instead of 4 separate list fields for [Branch / Division / Logo / Rank],
  create ONE text field: "Enter: Branch, Division, Logo#, Rank (e.g. Marine / 1st Div / Logo 3 / Enlisted)"

STRATEGY B — Use list only for the PRIMARY choice, collapse sub-options into text:
  Field 1 (list): Service Branch → Army / Marine / Navy / Air Force / Coast Guard / Space Force
  Field 2 (text): Branch Details → Enter division, logo number, rank (see product photos for options)
  Field 3 (text): Custom Name → Name to appear on product, max X chars

STRATEGY C — Repeat field for multi-person products:
  ONE "repeat" field covering all per-person data instead of separate fields per person

═══ FIELD TYPE DECISION ═══
Use LIST when: ≤30 options, buyer picks ONE, options are short labels
Use TEXT when: free input, OR when merging too many options would exceed 30 list items
Use REPEAT when: same set of fields repeats per person/kid/pet

═══ OUTPUT FORMAT (return ONLY valid JSON, no markdown) ═══
{
  "fields": [
    {
      "type": "list",
      "title": "...",
      "options": ["opt1", "opt2"],
      "required": true
    },
    {
      "type": "text",
      "title": "...",
      "instruction": "...",
      "example": "...",
      "required": true
    },
    {
      "type": "repeat",
      "label": "Each [person/kid/pet]",
      "subfields": "Name | Boy/Girl | Pose 1-6 (see photo left→right top→bottom)"
    }
  ]
}

═══ QUALITY RULES ═══
- Total fields MUST be ≤ 5. If you need more, consolidate further.
- Title ≤ 45 chars. Instruction ≤ 120 chars.
- List options ≤ 30. If more, convert to text field instead.
- For visual selections (poses, logos, avatars shown as images): use numbering with "(see photo, left→right top→bottom = 1,2,3...)"
- Repeat fields MUST collapse all per-person data into ONE field — never list Person #1, Person #2 separately
- required: true/false must reflect whether the product can be made without that info`;
    temperature = 0.2;

  } else {
    return res.status(400).json({ error: 'type phải là tm-check, gen-listing, hoặc gen-personalize' });
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
