// v2 deploy
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const AI_CLEANER_API_KEY = Deno.env.get("AI_CLEANER_API_KEY");
const GRSAI_MODEL = Deno.env.get("GRSAI_MODEL") || "nano-banana-pro";
const GRSAI_HOST = Deno.env.get("GRSAI_HOST") || "https://grsaiapi.com";
const CAPTION_MODEL = "gemini-2.0-flash";
// API keys are now per-user, read from profiles table

// ─── Helpers ───

function parseJsonResponse(rawText: string): any {
  let cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  const jsonStart = cleaned.search(/[\[\{]/);
  if (jsonStart === -1) throw new Error(`No JSON found in Gemini response: ${cleaned.substring(0, 200)}`);
  let jsonStr = cleaned.substring(jsonStart);
  jsonStr = jsonStr.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
  try { return JSON.parse(jsonStr); } catch { /* continue */ }
  if (jsonStr.startsWith("[")) {
    const objects: any[] = [];
    const objRegex = /\{[^{}]*\}/g;
    let m;
    while ((m = objRegex.exec(jsonStr)) !== null) {
      try {
        const obj = JSON.parse(m[0]);
        if (obj.title !== undefined && obj.content !== undefined) objects.push(obj);
      } catch { /* skip */ }
    }
    if (objects.length > 0) {
      console.warn(`Salvaged ${objects.length} complete slide objects from truncated Gemini response`);
      return objects;
    }
  }
  if (jsonStr.startsWith("{")) {
    try { return JSON.parse(jsonStr + '"}'); } catch { /* */ }
    try { return JSON.parse(jsonStr + "}"); } catch { /* */ }
  }
  throw new Error(`Failed to parse Gemini response: ${cleaned.substring(0, 200)}`);
}

// ─── Auth helper ───

async function authenticateAndCheckSubscription(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw { status: 401, message: "Unauthorized" };
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) throw { status: 401, message: "Unauthorized" };
  const userId = user.id;

  const { data: roleData } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleData) {
    const { data: sub } = await supabaseClient
      .from("subscriptions")
      .select("expires_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (!sub || new Date(sub.expires_at) <= new Date()) throw { status: 403, message: "Subscription required" };
  }

  // Read user API keys from profile
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("gemini_api_key, grsai_api_key, preferred_api")
    .eq("user_id", userId)
    .maybeSingle();

  // Fall back to env keys if user has no personal keys yet
  const userGeminiKey = profile?.gemini_api_key || Deno.env.get("GEMINI_API_KEY") || "";
  const userGrsaiKey = profile?.grsai_api_key || Deno.env.get("GRSAI_API_KEY") || "";
  const preferredApi = profile?.preferred_api || "gemini";

  // If subscription active but no keys assigned yet — show waiting screen signal
  if (!profile?.gemini_api_key && !profile?.grsai_api_key) {
    // No personal keys — use global fallback (admin generates with own keys)
    console.log("[auth] User has no personal API keys, using global fallback");
  }

  return { userId, supabaseClient, userGeminiKey, userGrsaiKey, preferredApi };
}

// ─── MODE: text ───

async function generateSlideContent(userText: string, funnel: string, style: string, apiKey?: string): Promise<{ title: string; content: string }[]> {
  const activeKey = apiKey || GEMINI_API_KEY || "";
  const funnelText = funnel || "подбери сам по теме";
  const systemPrompt = `Ты ассистент, который создаёт вирусные посты-карусели для экспертов мягких ниш (психологи, коучи, нумерологи).

Стиль оформления: ${style}

Создай ровно 7 слайдов на основе текста пользователя.

ТЕКСТ ПОЛЬЗОВАТЕЛЯ:
${userText}

ВОРОНКА (последний слайд):
${funnelText}

═══════════════════════════════════
СТРУКТУРА 7 СЛАЙДОВ:
═══════════════════════════════════

СЛАЙД 1 — ОБЛОЖКА (крючок):
- Заголовок: 2-3 строки, до 80 символов. Вызывает реакцию: "это про меня", "надо глянуть", "что за фигня?" Содержит крючок, вопрос, обещание или контраст.
- Подзаголовок: 1-2 строки, пояснение или интрига.
- В поле content добавь строку: ЛИСТАЙ →

СЛАЙДЫ 2-6 — КОНТЕНТ (каждый слайд = 1 мысль):
- Заголовок: 1 строка, ёмкий, с глаголом действия. Может быть вопросом, провокацией, парадоксом.
- Текст: Полные предложения с объяснениями. Живой, разговорный, с дыханием и эмоцией. Конкретные примеры, цифры, детали. Рассказывай КАК и ПОЧЕМУ, а не только ЧТО.
- Каждый слайд заканчивается так, чтобы хотелось листать дальше (эффект скользкой горки).
- Макс 120 символов в title, макс 300 символов в content.

СЛАЙД 7 — ПРИЗЫВ:
- Используй точно эту воронку: ${funnelText}
- Коротко, конкретно, без давления.
- Макс 120 символов в title, макс 200 символов в content.

═══════════════════════════════════
ЗАПРЕЩЕНО:
═══════════════════════════════════
- Списки из коротких фраз без объяснений
- Телеграфный стиль ("• создаю базу • получаю результат")
- Сухие перечисления без раскрытия
- Обрывочные фразы вместо полных мыслей
- Банальности типа "будьте позитивными"
- Канцелярит и сложные термины
- Слова: эксперт, контент, полезно, уникальный

═══════════════════════════════════
ОБЯЗАТЕЛЬНО:
═══════════════════════════════════
- 1 слайд = 1 законченная мысль
- Каждый слайд мотивирует листать дальше
- Живые примеры и визуальные образы
- Текст читается с телефона — коротко, но полноценно
- Сохраняй цифры, кейсы и детали из исходного текста

Верни строго JSON без markdown:
[
  {"title": "...", "content": "..."},
  {"title": "...", "content": "..."},
  {"title": "...", "content": "..."},
  {"title": "...", "content": "..."},
  {"title": "...", "content": "..."},
  {"title": "...", "content": "..."},
  {"title": "...", "content": "..."}
]

Ровно 7 объектов. Только JSON. Без пояснений.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${activeKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini slides API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const finishReason = data.candidates?.[0]?.finishReason || "";
  const slides = parseJsonResponse(rawText);

  if (Array.isArray(slides) && slides.length < 7 && (finishReason === "MAX_TOKENS" || slides.length < 5)) {
    console.warn(`Got only ${slides.length} slides (finishReason: ${finishReason}), retrying...`);
    try {
      const retryResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${activeKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
          }),
        }
      );
      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        const retryText = retryData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const retrySlides = parseJsonResponse(retryText);
        if (Array.isArray(retrySlides) && retrySlides.length > slides.length) return retrySlides;
      }
    } catch (retryErr) {
      console.warn("Retry failed, using salvaged slides:", retryErr);
    }
  }

  return slides;
}

async function generateCaption(userText: string, funnel: string, apiKey?: string): Promise<string> {
  const activeKey = apiKey || GEMINI_API_KEY || "";
  const captionPrompt = `Ты — живой копирайтер для психологов и экспертов.
Пишешь как человек, а не как робот. Никакой «нейросетевой» сухости — только живая речь.
На основе текста ниже напиши описание для поста в Instagram.

ТЕКСТ:
${userText}

ВОРОНКА:
${funnel || "Подбери сам по теме"}

СТРУКТУРА:
1. ПЕРВАЯ СТРОКА — цепляет за живое. Не "узнай как", не "сегодня поговорим о". Это либо провокация, либо боль в лоб, либо неожиданный факт. До 100 символов. Без эмодзи.

2. ПУСТАЯ СТРОКА — обязательно.

3. ОСНОВНОЙ ТЕКСТ — 3-4 абзаца. Разговорный, живой, на "ты". Короткие предложения. Паузы между мыслями.
   Пиши как будто говоришь умному другу за кофе.
   Не объясняй очевидное. Не повторяй слайды.
   Добавь деталь или мысль которой НЕТ в карусели.

4. ПРИЗЫВ — используй точно эту воронку: ${funnel || "Подбери сам по теме"}
   Один призыв. Коротко. Естественно вписан в текст.

5. ХЭШТЕГИ — 5-7 штук. Конкретные по теме.
   Не #психология #жизнь #саморазвитие — это мусор.

ЗАПРЕЩЕНО:
- "В современном мире" / "Как известно" / "Не секрет что"
- Восклицательные знаки в каждом предложении
- Эмодзи в роли декора — только по смыслу, максимум 3
- Пересказ карусели своими словами
- Слова "контент", "эксперт", "полезно"
- Любые фразы которые звучат как реклама

ТОНАЛЬНОСТЬ:
Умный. Немного провокационный. Человечный.
Как будто автор сам думал об этом и делится мыслью — а не публикует пост.
Пиши от имени эксперта-женщины.
Используй нейтральные формулировки:
'Вот что я думаю', 'Заметила', 'Поняла' —
не 'подумал', не 'заметил'.

Объём: 800-1000 символов.
Выдай только готовый текст. Без пояснений.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CAPTION_MODEL}:generateContent?key=${activeKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: captionPrompt }] }],
      generationConfig: { temperature: 0.85, maxOutputTokens: 2048 },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.warn(`[caption] ${CAPTION_MODEL} failed (${response.status}):`, data?.error?.message || JSON.stringify(data).slice(0, 200));
    return "";
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  if (!text && data.promptFeedback?.blockReason) {
    console.warn("[caption] Blocked:", data.promptFeedback.blockReason);
  } else if (!text) {
    console.warn("[caption] Empty response, candidates:", data.candidates?.length);
  }
  return text;
}

async function generateSeoMeta(userText: string, apiKey?: string): Promise<{ title: string; keywords: string }> {
  const activeKey = apiKey || GEMINI_API_KEY || "";
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${activeKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{
              text: `На основе текста ниже верни JSON без markdown:
{"title": "тема карусели в 5-7 слов", "keywords": "до 8 ключевых слов через запятую, релевантных теме, нише психолога, Instagram"}
Только JSON, без пояснений.
ТЕКСТ: ${userText}`,
            }],
          }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 256 },
        }),
      }
    );
    if (!response.ok) return { title: "", keywords: "Instagram карусель" };
    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { title: "", keywords: "Instagram карусель" };
  }
}

// ─── Auto style enhancement ───

async function generateAutoStyleEnhancement(userText: string, baseStyle: string, apiKey?: string): Promise<string> {
  const activeKey = apiKey || GEMINI_API_KEY || "";
  try {
    const prompt = `Based on this carousel topic: "${userText.substring(0, 200)}"
And base visual style: "${baseStyle}"

Return JSON only (no markdown, no explanation):
{
  "accent": "#HEX",
  "fontHeadline": "Font Name Bold",
  "fontBody": "Font Name Regular",
  "metaphor": "one key visual element for this niche",
  "mood": "emotional mood in 3 words"
}

RULES:
- accent: ONE hex color. Choose by topic: orange (#FF6B00) for energy/fear; green (#00C853) for money/growth; blue (#2196F3) for calm/trust; lime (#8BC34A) for motivation; coral (#FF7043) for warmth. Use this EXACT color for ALL highlights on all 7 slides.
- fontHeadline, fontBody: Google Fonts names, same on every slide
- metaphor: e.g. "boxing glove", "piggy bank", "compass"
- mood: e.g. "energetic confident"

Return ONLY valid JSON.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${activeKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 256 },
        }),
      }
    );

    if (!response.ok) return "";
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  } catch {
    return "";
  }
}

function parseStyleEnhancement(raw: string): { accent?: string; fontHeadline?: string; fontBody?: string; text?: string } {
  const result: { accent?: string; fontHeadline?: string; fontBody?: string; text?: string } = { text: raw };
  if (!raw?.trim()) return result;
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.accent && /^#[0-9A-Fa-f]{6}$/.test(parsed.accent)) result.accent = parsed.accent;
    if (parsed.fontHeadline) result.fontHeadline = parsed.fontHeadline;
    if (parsed.fontBody) result.fontBody = parsed.fontBody;
  } catch {
    const hexMatch = raw.match(/#[0-9A-Fa-f]{6}/);
    if (hexMatch) result.accent = hexMatch[0];
  }
  return result;
}

// ─── Style guides ───

function getStyleGuide(style: string): string {
  const styles: Record<string, string> = {
    'Профессиональный': `FORMAT: 1080x1350px vertical (4:5 ratio). NOT square.

PRIORITY ORDER — follow strictly:
1) Preserve person's face and appearance EXACTLY
2) Natural integration in office scene
3) Interior details

VISUAL STYLE: Professional Psychology Office.
SCENE: Real cozy psychology office interior.
Warm neutral tones — beige, ivory, sage green, soft terracotta.
Natural light from window.
Room elements: armchair, bookshelf with books,
indoor plants, soft lamp, wooden desk, notepad.
Atmosphere: safe, calm, professional warmth.

PERSON: Use ONLY the photo uploaded by the user.
Preserve exactly: face, hair, skin, appearance.
Person is NATURALLY IN THE SCENE — not a cutout.
Photographed IN this office, not pasted onto background.
Warm natural light falls on her matching room lighting.
Her shoes touch the floor naturally.
Her shadow falls naturally on the background.
Light source from window on the left side.
Her clothing edges blend naturally with surroundings.

POSES — randomly select one per slide from this list:
- Sitting in armchair, notepad in lap, warm smile
- Standing by window, soft light behind, looking at camera
- Sitting at desk with laptop, looking up naturally
- Standing near bookshelf, arms relaxed, thoughtful
- Sitting in armchair, tablet in hands
- Sitting at desk, pen in hand, writing
- Warm inviting smile, open gesture toward camera

TEXT: white rounded card at top of image.
Headlines: deep navy (#1B2A4A), bold.
Accent: use the ONE accent color from enhancement on ALL 7 slides. Same hex throughout. If no enhancement — warm terracotta (#C0614A).
Thin warm-toned geometric lines in corners.
NO plain gradient background. NO yellow blobs. NO circles.

TYPOGRAPHY — CRITICAL:
Same font for headlines on ALL 7 slides. Same font for body text on ALL 7 slides.
Use fonts from enhancement when available. Headlines: bold. Body: regular weight.
NO mixed fonts between slides. NO varying sizes.

LANGUAGE RULE — CRITICAL:
ALL text rendered in the image must be in Russian only.
ZERO English words anywhere on any slide.
If a concept has no Russian equivalent — transliterate it into Russian.

PHOTOGRAPHY PARAMETERS:
Camera: Sony A7R IV
Lens: 85mm f/1.4 prime lens
Aperture: f/1.4-f/2.0 (shallow depth of field)
ISO: 400-800 (slight organic grain)
Color grade: cinematic LUT, warm shadows, lifted blacks, desaturated highlights
Depth of field: subject sharp, background soft bokeh
Lighting: natural + one practical light source
Mood: editorial photography, magazine quality

RENDER QUALITY:
8K resolution, photorealistic, no AI artifacts, no plastic skin,
natural skin texture, film grain at 15% opacity, subtle vignette at edges`,

    'Светлый': `FORMAT: 1080x1350px vertical (4:5 ratio). NOT square.

CRITICAL RULE — PERSON IN SLIDES:
Use ONLY the photo uploaded by the user.
Preserve exactly: face, hair, skin, appearance.
Person is NATURALLY IN THE SCENE — not a cutout, not pasted.
She was photographed IN this location, not added later.
Matching lighting, shadows, color temperature throughout.
Her shoes touch the floor naturally. Her shadow falls naturally on the background.

SCENE INTEGRATION — vary per slide from this list:
- Bright Scandinavian living room, white walls, large window, morning light, linen couch
- Airy home office, white desk, plants, soft daylight from left
- Light café interior, marble table, coffee cup, warm morning sun
- Bright studio with white brick wall, wooden floor, natural light
- Cozy reading nook, white bookshelf, cream armchair, soft lamp
- Sunlit balcony with plants, city view softly blurred behind
- Modern kitchen with white counters, flowers in vase, morning atmosphere
Person interacts naturally with the environment — sitting, leaning, holding something relevant.

VISUAL STYLE: Light Premium Editorial — magazine cover style.
COLOR VARIATION RULE:
Each slide — choose ONE background tone from warm light family:
peach / cream / blush / ivory / warm white — matching the scene.
Accent: use the ONE accent color from enhancement on ALL 7 slides. Same hex throughout. If no enhancement — coral.
ONE thin accent line along RIGHT edge only.
Colors: Dark navy (#1A2B4A) main headlines, accent for highlights, gray body text.
Person placement: RIGHT half of image, large, bottom-aligned, slightly cut at knees.

TYPOGRAPHY — CRITICAL:
Same font for headlines on ALL 7 slides. Same font for body text on ALL 7 slides.
Use fonts from enhancement when available. Headlines: very large bold condensed sans-serif, stacked 3-4 lines left-aligned.
NO mixed fonts between slides. NO varying sizes.
Text placement: LEFT 45% of image, stacked vertically.
Atmosphere: Premium editorial fashion magazine — Vogue or Harper Bazaar aesthetic.

LANGUAGE RULE — CRITICAL:
ALL text rendered in the image must be in Russian only.
ZERO English words anywhere on any slide.
If a concept has no Russian equivalent — transliterate it into Russian.

PHOTOGRAPHY PARAMETERS:
Camera: Sony A7R IV
Lens: 85mm f/1.4 prime lens
Aperture: f/1.4-f/2.0 (shallow depth of field)
ISO: 400-800 (slight organic grain)
Color grade: cinematic LUT, warm shadows, lifted blacks, desaturated highlights
Depth of field: subject sharp, background soft bokeh
Mood: editorial photography, magazine quality

RENDER QUALITY:
8K resolution, photorealistic, no AI artifacts, no plastic skin,
natural skin texture, film grain at 15% opacity, subtle vignette at edges`,

    'Инфографика с экспертом — светлая': `FORMAT: 1080x1350px vertical (4:5 ratio). NOT square.

CRITICAL RULE — PERSON IN SLIDES:
Use ONLY the photo uploaded by the user.
Preserve exactly: face, hair, skin, appearance.
Person is NATURALLY IN THE SCENE — not a cutout, not pasted onto white background.
She physically EXISTS in this environment with matching lighting and shadows.
Her shoes touch the floor naturally when standing. Her shadow falls on the floor. She was photographed IN this office.

SCENE INTEGRATION — choose per slide topic:
- Standing at whiteboard/flipchart in bright office, marker in hand, pointing to diagram
- Sitting at wooden desk with open notebook, pen, laptop — bright coworking space
- Standing in front of bookshelf wall, holding open book relevant to topic
- At glass board with sticky notes, modern office, natural light
- Sitting in modern armchair, holding tablet showing data
- Standing near large window in bright office, gesturing toward infographic beside her
- At standing desk with monitor showing charts, morning office light
Person's pose matches the slide content — she EXPLAINS, POINTS, SHOWS.
Warm professional lighting. Real shadows. Real depth.

VISUAL STYLE: Expert Infographic — LIGHT — educational and engaging.
Background: real bright office/studio environment, NOT plain white.
No mint, no green, no teal tones ever.
Accent: use the ONE accent color from enhancement on ALL 7 slides. Same hex throughout.
PERSON: Place expert in CENTER or LEFT of image.
Expert physically holds or interacts with REAL PROPS relevant to the slide topic.
INFOGRAPHIC ELEMENTS: diagrams, charts, comparison tables, icons, arrows to the RIGHT of expert — overlaid cleanly on the scene.
Atmosphere: Educational, trustworthy, friendly expert sharing knowledge.

TYPOGRAPHY — CRITICAL:
Same font for headlines on ALL 7 slides. Same font for body text on ALL 7 slides.
Use fonts from enhancement. Headlines: bold, large. Body: regular weight.
NO mixed fonts between slides. NO varying sizes.

LANGUAGE RULE — CRITICAL:
ALL text rendered in the image must be in Russian only.
This includes: headlines, body text, labels, diagram captions,
infographic elements, chart labels, arrows with text.
ZERO English words anywhere on any slide.
If a concept has no Russian equivalent — transliterate it into Russian.

PHOTOGRAPHY PARAMETERS:
Camera: Sony A7R IV
Lens: 85mm f/1.4 prime lens
Aperture: f/1.4-f/2.0 (shallow depth of field)
ISO: 400-800 (slight organic grain)
Color grade: cinematic LUT, warm shadows, lifted blacks, desaturated highlights
Depth of field: subject sharp, background soft bokeh
Mood: editorial photography, magazine quality

RENDER QUALITY:
8K resolution, photorealistic, no AI artifacts, no plastic skin,
natural skin texture, film grain at 15% opacity, subtle vignette at edges`,

    'Инфографика с экспертом — тёмная': `FORMAT: 1080x1350px vertical (4:5 ratio). NOT square.

CRITICAL RULE — PERSON IN SLIDES:
Use ONLY the photo uploaded by the user.
Preserve exactly: face, hair, skin, appearance.
Person is NATURALLY IN THE SCENE — not a cutout, not pasted onto dark background.
She physically EXISTS in this environment with matching lighting and shadows.

DARK BACKGROUND MUST HOLD THE CHARACTER — CRITICAL:
The character must be PHYSICALLY GROUNDED in the dark scene. She must NOT appear floating, cut out, or composited onto the background.
- Character must stand ON a visible dark floor, or sit IN a chair/at a desk — always on a physical surface.
- Character casts a SOFT SHADOW on the dark floor or surface — this anchors her to the scene.
- Ambient lighting from the dark environment falls on her — her edges blend with surroundings, no sharp cut-out halo.
- Her clothing edges blend naturally with the dark background.
- Include environmental anchors: dark floor visible under her feet, desk edge, chair, window frame — elements that physically contain the character in the space.
- She was photographed IN this dark office, not added later. Same light sources illuminate both her and the environment.

SCENE INTEGRATION — choose per slide topic (each scene must have visible floor/surface):
- Standing ON dark floor at whiteboard in dark office, bright accent on screen, shadow on floor
- Standing near large window, city lights at night, feet on floor, soft glow from window
- Sitting AT desk with monitor showing charts, dark office, chair and desk visible
- Presenting with tablet in hand, standing or sitting ON surface, dark room with accent elements
- At glass board with sticky notes, dark modern office, floor visible
- Standing in front of infographic display, feet grounded, accent lighting
Person's pose matches the slide content — she EXPLAINS, POINTS, SHOWS.
Expert is lit by the SAME light sources as the dark environment — soft spotlight, window glow, or screen light. Soft shadows for grounding.

VISUAL STYLE: Expert Infographic — DARK — premium dark theme (like Sberbank).
BACKGROUND: Deep dark blue #1A1A2E or #12121F. Subtle texture — blueprint lines or grid at 5% opacity.
NO light backgrounds. NO white. NO gray backgrounds.
ACCENT: use the ONE accent color from enhancement on ALL 7 slides. Same hex throughout.
Use accent for: icons, highlighted text, lines, borders, buttons, badges, arrows.
PERSON: Place expert in CENTER or LEFT. She is GROUNDED in the dark scene — standing on floor, sitting in chair, or at desk.
Expert physically holds or interacts with REAL PROPS relevant to the slide topic.
INFOGRAPHIC ELEMENTS: diagrams, charts, flowcharts with accent arrows. Rounded dark cards #2A2A3E for content blocks.
Atmosphere: Premium, trustworthy, modern — like banking/fintech infographics.

TYPOGRAPHY — CRITICAL:
Same font for headlines on ALL 7 slides. Same font for body text on ALL 7 slides.
Headlines: bold sans-serif, white #FFFFFF. Body: regular weight, white #FFFFFF.
Key words highlighted in accent color. Use fonts from enhancement.
NO mixed fonts between slides. NO varying sizes.

LANGUAGE RULE — CRITICAL:
ALL text rendered in the image must be in Russian only.
This includes: headlines, body text, labels, diagram captions,
infographic elements, chart labels, arrows with text.
ZERO English words anywhere on any slide.
If a concept has no Russian equivalent — transliterate it into Russian.

RENDER QUALITY:
8K resolution, no AI artifacts, crisp edges, premium dark theme, professional infographic style.`,

    'Тёмный': `FORMAT: 1080x1350px vertical (4:5 ratio). NOT square.

CRITICAL RULE — PERSON IN SLIDES:
Use ONLY the photo uploaded by the user.
Do NOT generate, replace or modify the person.
Preserve exactly: face, hair, skin, appearance.
If no photo uploaded — leave person area empty.

VISUAL STYLE: Cinematic Warm Dark — premium psychology brand.
NO white backgrounds. NO infographics. NO diagrams.
NO 3D floating objects. NO glowing chains or stars.
Pure cinematic atmospheric photography.
COLOR PALETTE: Deep warm darks — burgundy (#3D0C11), rich amber, candlelight gold, soft warm shadows.
Accent: use the ONE accent color from enhancement on ALL 7 slides when available. If no enhancement — warm gold.
Text: warm gold serif for headlines, soft white for body.
PERSON: She must be INSIDE THE SCENE — physically part of the environment, not a cutout overlay.
Preserve exact face and appearance. Warm cinematic light falls on her naturally.
SCENES TO USE (rotate per slide):
- Evening armchair near rainy window, candle, lamp, books
- Standing at tall window, autumn park outside, silhouette
- Wooden desk with single candle, dark library behind
- Walking through autumn park at dusk, golden leaves
- Morning window with tea, plants, soft golden light
- Deep armchair, amber lamp light, looking upward
- Doorway between dark room and warm lit corridor
TEXT placement: on naturally dark areas of the photo.
Gold serif for headline. White for body text.

TYPOGRAPHY — CRITICAL:
Same font for headlines on ALL 7 slides. Same font for body text on ALL 7 slides.
Headlines: warm gold serif. Body: soft white, regular weight.
NO mixed fonts between slides. NO varying sizes.

ATMOSPHERE: Cinematic, emotional, premium therapy brand. Like a luxury film still.

LANGUAGE RULE — CRITICAL:
ALL text rendered in the image must be in Russian only.
ZERO English words anywhere on any slide.
If a concept has no Russian equivalent — transliterate it into Russian.

PHOTOGRAPHY PARAMETERS:
Camera: Sony A7R IV
Lens: 85mm f/1.4 prime lens
Aperture: f/1.4-f/2.0 (shallow depth of field)
ISO: 400-800 (slight organic grain)
Color grade: cinematic LUT, warm shadows, lifted blacks, desaturated highlights
Depth of field: subject sharp, background soft bokeh
Mood: editorial photography, magazine quality

RENDER QUALITY:
8K resolution, photorealistic, no AI artifacts, no plastic skin,
natural skin texture, film grain at 15% opacity, subtle vignette at edges`,

    'Персонаж': `FORMAT: 1080x1350px vertical (4:5 ratio). NOT square.

CRITICAL — CHARACTER DESCRIPTION (fix once):
Before generating any slides, create this exact character and use her on ALL 7 slides:
Woman, Pixar/Disney 3D style.
Appearance — use ONLY the uploaded reference photo to determine:
- Hair color, length and style — copy exactly from photo
- Glasses — only if visible in photo
- Age — match the person in photo
- Skin tone — match exactly
- Style: professional blazer matching her coloring
DO NOT invent appearance. Copy from photo.
THIS EXACT CHARACTER on every single slide.
Same hair. Same face. Same age. Consistent.
DO NOT make her younger or change appearance.
DO NOT remove glasses.
DO NOT change hair color.

BACKGROUND — vary per slide, choose from warm cozy scenes in 3D Pixar style:
- Cozy home library with warm bookshelves, soft lamp, cream walls
- Bright Scandinavian office, white desk, plants, large window
- Warm café corner, wooden table, pastel walls, morning light
- Cozy living room, cream sofa, bookshelf, candle, warm tones
- Airy studio with white brick, wooden floor, soft daylight
- Modern kitchen, white and wood tones, flowers, morning sun
- Peaceful garden terrace, flowers, soft warm light
All backgrounds in warm cream / ivory / peach / beige family.
Character is INSIDE the scene — sitting, standing, naturally placed.
NO plain gradient backgrounds. NO flat color backgrounds.
NO mint, NO lavender, NO purple, NO blue, NO teal. Ever.

TYPOGRAPHY — CRITICAL:
Same font on ALL 7 slides.
Font: rounded bold sans-serif, dark navy (#1A2B4A) for all headlines.
Body text: same font, regular weight, dark gray (#3D3D3D).
Headline: left-aligned, top area, large.
Body: left-aligned, below headline, medium.
NO centered text. NO text with outline/stroke.
NO mixed fonts between slides.

3D ELEMENTS:
Floating icons at chest/hand level only.
NEVER near or behind face.
Style: soft 3D clay/plastic, warm colors.
1-2 icons per slide maximum.

SLIDE NUMBERING:
Top right corner: small gray rounded pill, white text "X/7". SAME style on EVERY slide. No orange oval, no variations.

LANGUAGE RULE — CRITICAL:
ALL text rendered in the image must be in Russian only.
ZERO English words anywhere on any slide.
If a concept has no Russian equivalent — transliterate it into Russian.

CHARACTER CONSISTENCY — CRITICAL:
When characterDescription is provided (slides 2–7): use EXACTLY that character. Same hair, same face, same glasses, same blazer color.
Keep clothing STYLE identical. Blazer: SAME color on ALL 7 slides (e.g. orange #FF7043).
Same hair color, same hair length, same hair style on every slide.
DO NOT vary skin tone. DO NOT change glasses. DO NOT make her younger or older.
Base all slides on the character established in slide 1.
Slides 6 and 7 MUST look like the SAME carousel as slides 1–5 — same fonts, same character, same visual language.

RENDER QUALITY:
8K resolution, no AI artifacts, natural skin texture`,

    'Схемы & Инфографика': `FORMAT: 1080x1350px vertical (4:5 ratio). NOT square.

VISUAL STYLE: Dark Premium Infographic.

BACKGROUND: Deep dark charcoal #1A1A2E or #12121F.
Subtle dark texture — carbon fiber or dark grid pattern at 5% opacity.
NO light backgrounds. NO white. NO gray. Ever.

ACCENT COLOR: Vibrant orange #FF6B00 — ONE color only.
Use for: icons, highlighted text, lines, borders, buttons, badges.
NO blue, NO green, NO mixed accents. Only orange.

TYPOGRAPHY — CRITICAL:
Same font for headlines on ALL 7 slides. Same font for body text on ALL 7 slides.
Headlines: Bold condensed sans-serif (Bebas Neue style), ALL CAPS, white color.
Each headline starts with a relevant emoji icon.
Body text: Regular weight, white #FFFFFF, easy to read.
Key words in body: highlighted in orange #FF6B00, bold.
NO mixed fonts between slides. NO varying sizes.
Slides 6 and 7 MUST look like the SAME carousel as slides 1–5 — same fonts, same accent, same visual language.

3D ELEMENTS: Photorealistic 3D objects with depth, shadows and neon glow.
Objects must look premium rendered — NOT flat icons, NOT clipart.
Examples: glowing warning triangle, 3D rocket, 3D shield, 3D calendar.
Neon orange glow effect on key 3D objects.

INFOGRAPHIC ELEMENTS:
Clean flowcharts with orange arrows.
Rounded dark cards #2A2A3E for content blocks.
Orange checkmarks for positive items.
Red prohibition signs for negative items.
Orange circle numbers for steps.

LANGUAGE RULE — CRITICAL:
ALL text rendered in the image must be in Russian only.
This includes: headlines, body text, labels, diagram captions,
chart labels, arrows with text, all infographic elements.
ZERO English words anywhere on any slide.
If a concept has no Russian equivalent — transliterate it into Russian.

RENDER QUALITY:
8K resolution, no AI artifacts, crisp edges, premium dark theme, neon glow effects.`,

    'Сторителлинг': `FORMAT: 1080x1350px vertical (4:5 ratio). NOT square.

Generate ONE hyperrealistic photographic image (4:5 ratio, 1080x1350px).
Style: Cinematic photography, Sony A7R, 35mm f/2.0.
Real people, real locations. NOT illustration, NOT cartoon.
For each slide — illustrate the EXACT SCENE described in the slide content.
Characters must stay CONSISTENT across all slides (same faces, clothes, hair throughout the carousel).

TEXT PLACEMENT:
- Bottom: Floating semi-transparent rounded rectangular glassmorphism plate.
- Plate background: rgba(0,0,0,0.4).
- Position: Bottom center, slightly above the bottom edge.
- Width: ~90% of frame width.
- Line 1: headline — white bold 32px, always in quotes like «Headline».
- Lines 2-3: body text — white italic 24px, positioned below headline.
- Do NOT show raw labels like "TITLE:" or "BODY:" — render the text naturally.
Slides 1-7: Small dark-grey rounded pill in top-right corner: X/7.

TYPOGRAPHY — CRITICAL:
Same font for headlines on ALL 7 slides. Same font for body text on ALL 7 slides.
NO mixed fonts between slides. NO varying sizes.
Slides 6 and 7 MUST look like the SAME carousel as slides 1–5 — same fonts, same visual language.

Lighting: warm cinematic sunset lighting (golden hour).
Each scene: dramatically expressive characters, emotions readable.
Depth of field — foreground sharp, background soft bokeh.

LANGUAGE RULE — CRITICAL:
ALL text rendered in the image must be in Russian only.
ZERO English words anywhere on any slide.
If a concept has no Russian equivalent — transliterate it into Russian.

PHOTOGRAPHY PARAMETERS:
Camera: Sony A7R IV
Lens: 85mm f/1.4 prime lens
Aperture: f/1.4-f/2.0 (shallow depth of field)
ISO: 400-800 (slight organic grain)
Color grade: cinematic LUT, warm shadows, lifted blacks
Mood: editorial photography, magazine quality

RENDER QUALITY:
8K resolution, photorealistic, no AI artifacts, no plastic skin,
natural skin texture, film grain at 15% opacity, subtle vignette at edges`,
  };
  if (style === 'Инфографика с экспертом') return styles['Инфографика с экспертом — светлая'];
  return styles[style] || styles['Профессиональный'];
}

// ─── Photo integration block ───

function getPhotoIntegrationBlock(style: string, hasPhotos: boolean): string {
  if (!hasPhotos) return "";
  const photoStyles = ['Профессиональный', 'Тёмный', 'Светлый', 'Персонаж', 'Инфографика с экспертом — светлая', 'Инфографика с экспертом — тёмная'];
  if (!photoStyles.includes(style)) return "";
  return `
PHOTO INTEGRATION — CRITICAL:
The uploaded photos show the expert/author.
Naturally integrate her into the scene.
She physically EXISTS in this environment.
Matching lighting, shadows, color temperature.
Her shoes touch the floor naturally.
Her shadow falls naturally on the background.
Light source direction matches the scene.
Her clothing edges blend naturally with surroundings.
DO NOT cut-and-paste. DO NOT add frame or border.
Preserve exactly: face, hair, skin tone, appearance.
She was photographed IN this scene, not added later.
CONSISTENCY: Same face and hair across ALL 7 slides.
`;
}

// ─── Grsai (Резервное API) ───

async function generateImageGrsai(
  prompt: string,
  userPhotos: string[],
  apiKey: string
): Promise<{ imageBase64: string; mimeType: string }> {
  if (!apiKey) throw new Error("Резервный API не настроен. Обратитесь в поддержку.");

  const requestBody: Record<string, unknown> = {
    model: GRSAI_MODEL,
    prompt: prompt,
    aspectRatio: "4:5",
    webHook: "-1",
    shutProgress: true,
  };

  // imageSize supported by nano-banana-2, nano-banana-pro
  if (["nano-banana-2", "nano-banana-pro"].includes(GRSAI_MODEL)) {
    (requestBody as any).imageSize = "1K";
  }

  if (userPhotos && userPhotos.length > 0) {
    (requestBody as any).urls = userPhotos.slice(0, 3).map((p: string) => {
      const base64 = p.startsWith("data:") ? p.replace(/^data:[^;]+;base64,/, "") : p;
      return base64;
    });
  }

  const createUrl = `${GRSAI_HOST.replace(/\/$/, "")}/v1/draw/nano-banana`;
  const resultUrl = `${GRSAI_HOST.replace(/\/$/, "")}/v1/draw/result`;

  const response = await fetch(createUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  const rawText = await response.text();
  let initData: any;
  try {
    initData = JSON.parse(rawText);
  } catch {
    throw new Error("Grsai API error " + response.status + ": " + rawText.substring(0, 300));
  }

  if (!response.ok) {
    const msg = initData?.msg || initData?.error || rawText.substring(0, 300);
    throw new Error("Grsai API error " + response.status + ": " + msg);
  }

  if (initData?.code !== undefined && initData.code !== 0) {
    const msg = initData?.msg || initData?.error || "Unknown error";
    console.error("[Grsai] Create failed:", JSON.stringify(initData));
    throw new Error("Grsai: " + msg);
  }

  const taskId = initData?.data?.id || initData?.id;
  if (!taskId) {
    console.error("[Grsai] No task id in response:", JSON.stringify(initData));
    throw new Error("Grsai: не получен task id. Ответ: " + (initData?.msg || "неизвестно"));
  }

  console.log("[Grsai] Task created: " + taskId);

  let imageUrl: string | null = null;
  for (let i = 0; i < 120; i++) {
    await new Promise(resolve => setTimeout(resolve, 3000));

    const pollResponse = await fetch(resultUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify({ id: taskId }),
    });

    const pollRaw = await pollResponse.text();
    if (!pollResponse.ok) {
      console.warn("[Grsai] Poll " + (i + 1) + " HTTP " + pollResponse.status + ": " + pollRaw.substring(0, 200));
      continue;
    }

    let pollData: any;
    try {
      pollData = JSON.parse(pollRaw);
    } catch {
      continue;
    }

    if (pollData?.code !== undefined && pollData.code !== 0) {
      if (pollData.code === -22) {
        throw new Error("Grsai: задача не найдена (id: " + taskId + ")");
      }
      console.warn("[Grsai] Poll " + (i + 1) + " code=" + pollData.code + ": " + (pollData?.msg || ""));
      continue;
    }

    const result = pollData?.data;
    console.log("[Grsai] Poll " + (i + 1) + ": status=" + result?.status);

    if (result?.status === "succeeded" && result?.results?.[0]?.url) {
      imageUrl = result.results[0].url;
      break;
    }
    if (result?.status === "failed") {
      const reason = result?.failure_reason || result?.error || "unknown";
      console.error("[Grsai] Task failed:", reason);
      throw new Error("Grsai: генерация не удалась — " + reason);
    }
  }

  if (!imageUrl) {
    throw new Error("Grsai: таймаут — изображение не получено за 6 минут");
  }

  console.log("[Grsai] Downloading: " + imageUrl);
  const imgResponse = await fetch(imageUrl);
  if (!imgResponse.ok) {
    throw new Error("Grsai: не удалось загрузить изображение (HTTP " + imgResponse.status + ")");
  }
  const arrayBuffer = await imgResponse.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);

  return { imageBase64: btoa(binary), mimeType: "image/png" };
}

// ─── Generate one slide image ───

async function generateOneSlideImage(
  slideNumber: number,
  title: string,
  content: string,
  style: string,
  userPhotos: string[],
  characterDescription?: string,
  autoStyleEnhancement?: string,
  apiKeys?: { geminiKey: string; grsaiKey: string; preferredApi: string }
): Promise<{ imageBase64: string; mimeType: string }> {
  const isLastSlide = slideNumber === 7;
  const isFirstSlide = slideNumber === 1;
  const styleDesc = getStyleGuide(style);
  const hasPhotos = userPhotos && userPhotos.length > 0;
  const noPersonStyles = ['Схемы & Инфографика', 'Персонаж', 'Сторителлинг'];
  const needsPhoto = !noPersonStyles.includes(style);
  const personStyles = ['Профессиональный', 'Светлый', 'Инфографика с экспертом — светлая', 'Инфографика с экспертом — тёмная', 'Тёмный', 'Персонаж'];
  const hasPersonInScene = personStyles.includes(style);

  const characterBlock = characterDescription && (style === 'Сторителлинг' || (style === 'Персонаж' && slideNumber > 1))
    ? `\nMAIN CHARACTER CONSISTENCY — CRITICAL:\nUse EXACTLY this character in this slide. Do NOT vary.\n${characterDescription}\nSame face, same hair color, same hair style, same glasses, same skin tone, same age.\nSame blazer color (e.g. orange) on ALL slides. Do NOT change or replace this character.\n`
    : "";

  const photoIntegrationBlock = getPhotoIntegrationBlock(style, hasPhotos && needsPhoto);

  const noEnhancementStyles = ['Схемы & Инфографика'];
  const parsed = parseStyleEnhancement(autoStyleEnhancement || "");
  const accentBlock = parsed.accent
    ? `\nPRIMARY ACCENT COLOR — CRITICAL: Use ${parsed.accent} for ALL highlights, icons, buttons, arrows, key words on ALL 7 slides. Same color throughout. No other accent colors.\n`
    : "";
  const fontBlock = (parsed.fontHeadline || parsed.fontBody)
    ? `\nTYPOGRAPHY: Headlines — ${parsed.fontHeadline || "bold sans-serif"}. Body — ${parsed.fontBody || "regular sans-serif"}. Use SAME fonts on every slide.\n`
    : "";
  const styleEnhancementBlock = autoStyleEnhancement && !noEnhancementStyles.includes(style)
    ? `\nTOPIC-SPECIFIC STYLE ENHANCEMENT:\n${autoStyleEnhancement}\n${accentBlock}${fontBlock}Apply these enhancements while maintaining base style.\n`
    : accentBlock || fontBlock ? `${accentBlock}${fontBlock}` : "";

  const renderTextBlock = style === 'Сторителлинг'
    ? `Render this text IN the image design:\nTitle: '${title}'\nBody text: '${content || ""}'`
    : `RENDER THIS TEXT IN THE IMAGE:\nTITLE: '${title}'\nBODY: '${content || ""}'\nTypography: bold, high contrast, perfectly legible on mobile.\nALL TEXT MUST BE IN RUSSIAN ONLY.`;

  const prompt = `CRITICAL: Do NOT embed any AI-related metadata, keywords or tags in the image. No mentions of ChatGPT, Gemini, AI, artificial intelligence in any metadata fields.
CRITICAL: Vertical format 1080x1350px (4:5 ratio). NOT square. NOT 1080x1080px. NEVER square.

MANDATORY VISUAL CONSISTENCY: All 7 slides must share identical color palette, lighting mood, and typography style throughout the carousel. Slides 6 and 7 MUST look like the SAME carousel as slides 1-5 — same fonts, same accent color, same visual language. Do NOT switch to a different style.

LANGUAGE RULE — CRITICAL FOR ALL STYLES:
ALL text rendered in the image must be in Russian only.
This includes: headlines, body text, labels, diagram captions, infographic elements, button text, badges, icons with text, chart labels, arrows with text.
ZERO English words anywhere on any slide.
If a concept has no Russian equivalent — transliterate it into Russian.

${characterBlock}${photoIntegrationBlock}${styleEnhancementBlock}
Instagram carousel slide ${slideNumber} of 7.
${isFirstSlide ? "This is the COVER slide — make it eye-catching and bold." : ""}
${isLastSlide ? "This is the CTA slide — make it action-oriented with clear call to action." : ""}
${hasPhotos && needsPhoto ? "Include a person in the slide that matches the uploaded reference photo." : ""}
Professional social media post, high quality, modern design.
Do NOT add any borders or watermarks.

${renderTextBlock}

STYLE GUIDE:
${styleDesc}
${hasPersonInScene ? `
CRITICAL RULE FOR 3D ELEMENTS:
- NEVER place 3D objects near or behind the expert's head.
- 3D elements must be placed to the LEFT or RIGHT side of the frame, at chest/hand level or below.
- Keep expert's head and face completely clean — no glows, halos, or objects overlapping the face area.` : ""}`;

  const parts: any[] = [];

  if (hasPhotos && needsPhoto && userPhotos.length > 0) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: userPhotos[0] } });
    parts.push({
      text: `Reference person photo above. Create slide ${slideNumber} with this person featured naturally in the design.\n${prompt}`,
    });
  } else {
    parts.push({ text: prompt });
  }

  // ─── Выбор API по настройке пользователя ───
  const activeApi = apiKeys?.preferredApi || "gemini";
  const geminiKey = apiKeys?.geminiKey || GEMINI_API_KEY || "";
  const grsaiKey = apiKeys?.grsaiKey || "";

  if (activeApi === "grsai") {
    console.log(`[image] Slide ${slideNumber} — using Резервный 1 API (model: ${GRSAI_MODEL})`);
    const fullPrompt = parts
      .filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join("\n");
    return await generateImageGrsai(fullPrompt, hasPhotos && needsPhoto ? userPhotos : [], grsaiKey);
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini image API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0]?.content?.parts || [];
  for (const part of candidate) {
    if (part.inlineData) {
      return { imageBase64: part.inlineData.data, mimeType: part.inlineData.mimeType || "image/png" };
    }
  }
  throw new Error(`No image returned for slide ${slideNumber}`);
}

// ─── MODE: describe-character ───

async function describeCharacterFromImage(imageBase64: string, mimeType: string, apiKey?: string): Promise<string> {
  const activeKey = apiKey || GEMINI_API_KEY || "";
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${activeKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { inlineData: { mimeType, data: imageBase64 } },
              { text: "Describe the main character in this image in detail: hair color, hair style, hair length, face features, skin tone, age, glasses (style: round/rectangular, color), blazer/jacket color. Be specific so the same character can be reproduced exactly. Return only a short English description, 2-3 sentences maximum." },
            ],
          }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 256 },
        }),
      }
    );
    if (!response.ok) return "";
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  } catch { return ""; }
}

// ─── MODE: clean ───

async function cleanSlideImage(
  imageBase64: string,
  mimeType: string,
  title: string,
  keywords: string
): Promise<{ imageBase64: string; mimeType: string }> {
  if (!AI_CLEANER_API_KEY) return { imageBase64, mimeType };
  try {
    const binaryStr = atob(imageBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const ext = mimeType === "image/jpeg" ? "jpeg" : "png";
    const formData = new FormData();
    formData.append("file", new Blob([bytes], { type: mimeType }), `slide.${ext}`);
    formData.append("title", title || "Instagram carousel");
    formData.append("author", "");
    formData.append("software", "Adobe Lightroom Classic 13.0");
    formData.append("keywords", keywords || "Instagram карусель");

    const res = await fetch("https://mcp-kv.ru/ai-delete/api/clean", {
      method: "POST",
      headers: { "X-API-Key": AI_CLEANER_API_KEY },
      body: formData,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn(`AI Cleaner returned ${res.status}: ${errBody}`);
      return { imageBase64, mimeType };
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.startsWith("image/")) {
      const buffer = await res.arrayBuffer();
      const cleanedBytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < cleanedBytes.length; i++) binary += String.fromCharCode(cleanedBytes[i]);
      return { imageBase64: btoa(binary), mimeType: contentType.split(";")[0].trim() || mimeType };
    }

    const rawBody = await res.text();
    let cleaned: any;
    try { cleaned = JSON.parse(rawBody); } catch {
      const buffer = new TextEncoder().encode(rawBody);
      if (buffer.length > 1000 && rawBody.charCodeAt(0) === 0xFF && rawBody.charCodeAt(1) === 0xD8) {
        let binary = "";
        for (let i = 0; i < buffer.length; i++) binary += String.fromCharCode(buffer[i]);
        return { imageBase64: btoa(binary), mimeType: "image/jpeg" };
      }
      return { imageBase64, mimeType };
    }

    if (cleaned.download_url) {
      const fileRes = await fetch(cleaned.download_url);
      if (!fileRes.ok) return { imageBase64, mimeType };
      const buffer = await fileRes.arrayBuffer();
      const cleanedBytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < cleanedBytes.length; i++) binary += String.fromCharCode(cleanedBytes[i]);
      return { imageBase64: btoa(binary), mimeType };
    }
    if (cleaned.image_base64) return { imageBase64: cleaned.image_base64, mimeType: cleaned.mime_type || mimeType };
    return { imageBase64, mimeType };
  } catch (e) {
    console.warn("AI Cleaner error:", e);
    return { imageBase64, mimeType };
  }
}

// ─── Main handler ───

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const { userId, userGeminiKey, userGrsaiKey, preferredApi } = await authenticateAndCheckSubscription(req).catch((e: any) => { throw e; });
    const apiKeys = { geminiKey: userGeminiKey, grsaiKey: userGrsaiKey, preferredApi };

    const body = await req.json();
    const mode = body.mode || "text";

    // ─── MODE: text ───
    if (mode === "text") {
      const { userText, funnel, style, mode_ready, rawText } = body;

      if (mode_ready === true && rawText) {
        console.log("[text] Ready carousel mode — parsing via Gemini");
        const parsePrompt = `Разбей этот текст карусели на 7 слайдов.
Верни строго JSON без markdown — массив из 7 объектов:
[{"title": "заголовок слайда", "content": "текст слайда"}, ...]
Правила:
- Ровно 7 объектов
- title = заголовок слайда (без слова Заголовок:)
- content = основной текст слайда (без слова Текст: или Подзаголовок:)
- Слайд 1 — обложка: в content добавь "ЛИСТАЙ →" в конце
- Слайд 7 берёшь как есть, ничего не меняешь
- Лимиты: title до 120 символов, content слайдов 2-6 до 300 символов, content слайда 7 до 200 символов
- Только JSON, без пояснений
ТЕКСТ КАРУСЕЛИ:
${rawText}`;

        const parseResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${userGeminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: parsePrompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
            }),
          }
        );
        if (!parseResponse.ok) throw new Error("Gemini parse error: " + await parseResponse.text());
        const parseData = await parseResponse.json();
        const rawParsed = parseData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const slideContents = parseJsonResponse(rawParsed);

        let caption = (await generateCaption(rawText, funnel || "", userGeminiKey))?.trim() || "";
        if (!caption && slideContents?.length > 0) {
          const titles = slideContents.slice(0, 7).map((s: { title?: string }) => s.title).filter(Boolean).join(". ");
          caption = titles ? `${titles}\n\nСохрани себе — пригодится!` : "";
        }
        const seoMeta = await generateSeoMeta(rawText, userGeminiKey).catch(() => ({ title: "", keywords: "" }));
        let autoStyleEnhancement = "";
        try {
          autoStyleEnhancement = await generateAutoStyleEnhancement(rawText.substring(0, 200), style || "Профессиональный", userGeminiKey);
        } catch (e) {
          console.warn("Auto style enhancement failed:", e);
        }

        return new Response(JSON.stringify({
          success: true,
          slides: slideContents.slice(0, 7),
          caption,
          seoMeta,
          autoStyleEnhancement,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (!userText?.trim()) {
        return new Response(JSON.stringify({ success: false, error: "userText is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`[text] Generating texts for style: ${style}, api: ${preferredApi}`);
      const [slideContents, rawCaption, seoMeta] = await Promise.all([
        generateSlideContent(userText, funnel || "", style || "Профессиональный", userGeminiKey),
        generateCaption(userText, funnel || "", userGeminiKey),
        generateSeoMeta(userText, userGeminiKey),
      ]);
      let caption = rawCaption?.trim() || "";
      if (!caption && slideContents?.length > 0) {
        const titles = slideContents.slice(0, 7).map((s: { title?: string }) => s.title).filter(Boolean).join(". ");
        caption = titles ? `${titles}\n\nСохрани себе — пригодится!` : "";
      }
      let autoStyleEnhancement = "";
      try {
        autoStyleEnhancement = await generateAutoStyleEnhancement(userText, style || "Профессиональный", userGeminiKey);
      } catch (e) {
        console.warn("Auto style enhancement failed:", e);
      }
      return new Response(JSON.stringify({
        success: true,
        slides: slideContents.slice(0, 7),
        caption,
        seoMeta,
        autoStyleEnhancement,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MODE: image ───
    if (mode === "image") {
      const { slideNumber, title, content, style, userPhotos, characterDescription, autoStyleEnhancement } = body;

      // Check generation limit on first slide only
      if (slideNumber === 1) {
        const ADMIN_USER_ID = "399da17d-9727-445f-bb4b-a9e32656bac7";
        if (userId !== ADMIN_USER_ID) {
          const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
          );
          const monthStart = new Date();
          monthStart.setDate(1);
          monthStart.setHours(0, 0, 0, 0);

          // Get custom limit from profile
          const { data: profileData } = await supabaseAdmin
            .from("profiles")
            .select("generation_limit")
            .eq("user_id", userId)
            .maybeSingle();
          const limit = profileData?.generation_limit || 200;

          const { count } = await supabaseAdmin
            .from("generation_logs")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .gte("created_at", monthStart.toISOString())
            .is("error", null);

          if (count !== null && count >= limit) {
            return new Response(JSON.stringify({
              success: false,
              error: "Достигнут лимит генераций " + limit + " каруселей. Для возобновления работы сервиса необходимо обратиться в техподдержку и оплатить генерацию дополнительного количества каруселей.",
            }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
      }

      console.log(`[image] Generating slide ${slideNumber} image, preferred API: ${apiKeys.preferredApi}`);
      const imageData = await generateOneSlideImage(
        slideNumber, title, content || "",
        style || "Профессиональный",
        userPhotos || [],
        characterDescription,
        autoStyleEnhancement,
        apiKeys
      );
      // Сохраняем слайд в Supabase Storage
      let slideUrl = "";
      try {
        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        const ext = imageData.mimeType === "image/jpeg" ? "jpg" : "png";
        const fileName = `${userId}/${Date.now()}_slide${slideNumber}.${ext}`;
        const binaryStr = atob(imageData.imageBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from("carousel-slides")
          .upload(fileName, bytes, { contentType: imageData.mimeType, upsert: false });
        if (!uploadError && uploadData) {
          const { data: urlData } = supabaseAdmin.storage
            .from("carousel-slides")
            .getPublicUrl(fileName);
          slideUrl = urlData?.publicUrl || "";
        }
      } catch (storageErr) {
        console.warn("[storage] Failed to save slide:", storageErr);
      }

      return new Response(JSON.stringify({
        success: true,
        imageBase64: imageData.imageBase64,
        mimeType: imageData.mimeType,
        slideUrl,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MODE: describe-character ───
    if (mode === "describe-character") {
      const { imageBase64, mimeType } = body;
      console.log("[describe-character] Extracting character description...");
      const description = await describeCharacterFromImage(imageBase64, mimeType || "image/png", userGeminiKey);
      return new Response(JSON.stringify({ success: true, description }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── MODE: clean ───
    if (mode === "clean") {
      const { imageBase64, mimeType, title, keywords } = body;
      console.log("[clean] Cleaning slide image");
      const cleaned = await cleanSlideImage(imageBase64, mimeType || "image/png", title || "", keywords || "");
      return new Response(JSON.stringify({
        success: true,
        imageBase64: cleaned.imageBase64,
        mimeType: cleaned.mimeType,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MODE: log ───
    if (mode === "log") {
      const { style, funnel, userText, slideCount, caption, durationMs, slidesJson, error, apiProvider } = body;
      try {
        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await supabaseAdmin.from("generation_logs").insert({
          user_id: userId,
          style: style || "Профессиональный",
          funnel: funnel || null,
          user_text: userText,
          slide_count: slideCount,
          caption,
          duration_ms: durationMs,
          slides_json: slidesJson,
          error,
          api_provider: apiProvider || "gemini",
        });

        if (body.slideUrls && body.slideUrls.length > 0) {
          await supabaseAdmin.from("carousel_sessions").insert({
            user_id: userId,
            style: style || "Профессиональный",
            slide_urls: body.slideUrls,
            caption: caption || "",
          });
        }
      } catch (logErr) {
        console.error("Failed to save log:", logErr);
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, error: `Unknown mode: ${mode}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    const status = err.status || 500;
    const message = err.message || (err instanceof Error ? err.message : "Unknown error");
    console.error("generate-slides error:", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
