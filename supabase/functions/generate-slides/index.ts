import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const AI_CLEANER_API_KEY = Deno.env.get("AI_CLEANER_API_KEY");

// ─── Helpers ───

function parseJsonResponse(rawText: string): any {
  const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/[\[\{][\s\S]*[\]\}]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {
        const fixed = match[0].replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, (ch) => ch === '\n' || ch === '\t' ? ch : "");
        try { return JSON.parse(fixed); } catch {
          throw new Error(`Failed to parse Gemini response: ${cleaned.substring(0, 200)}`);
        }
      }
    }
    throw new Error(`Invalid JSON from Gemini: ${cleaned.substring(0, 200)}`);
  }
}

// ─── Auth helper ───

async function authenticateAndCheckSubscription(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw { status: 401, message: "Unauthorized" };
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    throw { status: 401, message: "Unauthorized" };
  }

  const userId = claimsData.claims.sub;
  const { data: sub } = await supabaseClient
    .from("subscriptions")
    .select("expires_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!sub || new Date(sub.expires_at) <= new Date()) {
    throw { status: 403, message: "Subscription required" };
  }

  return { userId, supabaseClient };
}

// ─── MODE: text ───

async function generateSlideContent(userText: string, funnel: string, style: string): Promise<{ title: string; content: string }[]> {
  const funnelText = funnel || "подбери сам по теме";
  const systemPrompt = `Ты помогаешь создавать вирусные карусели для Instagram для экспертов мягких ниш (психологи, коучи, нумерологи).

ИСХОДНЫЙ ТЕКСТ ЭКСПЕРТА:
${userText}

ВОРОНКА (последний слайд):
${funnelText}

Создай 7 слайдов строго по структуре:

СЛАЙД 1 — ОБЛОЖКА:
Заголовок: цепляющий, с болью или интригой, макс 7 слов.
Подзаголовок: 1-2 строки, интрига или пояснение.
В поле content добавь строку: ЛИСТАЙ →

СЛАЙДЫ 2-6 — КОНТЕНТ:
Заголовок: 1 строка, глагол действия или вопрос.
Текст: полные предложения, живой разговорный язык.
Конкретные примеры и детали.
Каждый слайд заканчивается так, чтобы хотелось листать.
Макс 120 символов в title, макс 300 символов в content.

СЛАЙД 7 — ПРИЗЫВ:
Используй воронку: ${funnelText}
Коротко, конкретно, без давления.
Макс 120 символов в title, макс 200 символов в content.

ЗАПРЕЩЕНО:
- Списки и буллеты внутри текста
- Слова: эксперт, контент, полезно, уникальный
- Обрывочные фразы без полных мыслей
- Банальности

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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini slides API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return parseJsonResponse(rawText);
}

async function generateCaption(userText: string, funnel: string): Promise<string> {
  const captionPrompt = `Ты — живой копирайтер для психологов и экспертов.
Пишешь как человек, а не как робот.
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

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: captionPrompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
      }),
    }
  );

  if (!response.ok) return "";
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

async function generateSeoMeta(userText: string): Promise<{ title: string; keywords: string }> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
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

async function generateAutoStyleEnhancement(
  userText: string,
  baseStyle: string
): Promise<string> {
  try {
    const prompt = `Based on this carousel topic: "${userText.substring(0, 200)}"
And base visual style: "${baseStyle}"

Generate a SHORT visual enhancement (max 100 words, English only):
- 2 specific font names from Google Fonts
- 3 exact hex color codes fitting this topic
- 1 key visual metaphor or element for this niche
- 1 sentence describing the emotional mood

Return ONLY the enhancement text. No headers. No explanations.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200 },
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
Her feet touch the floor.
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
Accent text: warm terracotta (#C0614A).
Thin warm-toned geometric lines in corners.
NO plain gradient background. NO yellow blobs. NO circles.

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
Do NOT generate, replace or modify the person.
Preserve exactly: face, hair, skin, appearance.
If no photo uploaded — leave person area empty.

VISUAL STYLE: Light Premium Editorial — magazine cover style.
COLOR VARIATION RULE:
Each slide — choose ONE background tone from warm light family:
peach / cream / blush / ivory / warm white.
Accent: coral / salmon / terracotta / dusty rose.
ONE thin coral line along RIGHT edge only.
Colors: Dark navy (#1A2B4A) main headlines, coral accent, gray body text.
Typography: Very large bold condensed sans-serif headlines stacked 3-4 lines left-aligned.
Person placement: RIGHT half of image, large, bottom-aligned, slightly cut at knees.
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

    'Инфографика с экспертом': `FORMAT: 1080x1350px vertical (4:5 ratio). NOT square.

CRITICAL RULE — PERSON IN SLIDES:
Use ONLY the photo uploaded by the user.
Do NOT generate, replace or modify the person.
Preserve exactly: face, hair, skin, appearance.
If no photo uploaded — leave person area empty.

VISUAL STYLE: Expert Infographic — educational and engaging.
Background: pure white (#FFFFFF) only.
No mint, no green, no teal tones ever.
Accent: bright tone from blue/green/coral family, vary per slide.
PERSON: Place expert in CENTER or LEFT of image.
Expert physically holds or interacts with REAL PROPS relevant to the slide topic.
INFOGRAPHIC ELEMENTS: diagrams, charts, comparison tables, icons, arrows to the RIGHT of expert.
Atmosphere: Educational, trustworthy, friendly expert sharing knowledge.

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

Background: warm cream to white gradient ONLY (#FFF8F0 → #FFFFFF).
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
Top right corner: small gray rounded pill white text "X/7". Every slide.

LANGUAGE RULE — CRITICAL:
ALL text rendered in the image must be in Russian only.
ZERO English words anywhere on any slide.
If a concept has no Russian equivalent — transliterate it into Russian.

CHARACTER CONSISTENCY:
Keep clothing COLOR varied per slide but style identical.
Same hair, same face, same proportions throughout.
Base all slides on the character established in slide 1.

RENDER QUALITY:
8K resolution, no AI artifacts, natural skin texture`,

    'Схемы & Инфографика': `FORMAT: 1080x1350px vertical (4:5 ratio). NOT square.

VISUAL STYLE: Clean Data Infographic. NO person needed.
Background: clean light tone, vary per slide: white / off-white / light gray only.
NO pale blue, NO mint, NO teal backgrounds.
Accent: professional tone from navy / teal / slate / deep blue family.
Warning elements: coral / red-orange / salmon family.
Typography: Bold modern Montserrat-style sans-serif.
Visual elements: Clean diagrams, arrows, comparison tables, numbered steps with icons, progress bars, before/after splits.
Atmosphere: Educational, authoritative, consulting quality.

LANGUAGE RULE — CRITICAL:
ALL text rendered in the image must be in Russian only.
This includes: headlines, body text, labels, diagram captions,
chart labels, arrows with text, all infographic elements.
ZERO English words anywhere on any slide.
If a concept has no Russian equivalent — transliterate it into Russian.

RENDER QUALITY:
8K resolution, no AI artifacts, clean crisp edges`,

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
SLIDE 1 ONLY: Large coral/peach colored text on the right side: ЛИСТАЙ → (bold, 50px).
Slides 1-7: Small dark-grey rounded pill in top-right corner: X/7.
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
  return styles[style] || styles['Профессиональный'];
}

// ─── Photo integration block ───

function getPhotoIntegrationBlock(style: string, hasPhotos: boolean): string {
  if (!hasPhotos) return "";
  const photoStyles = ['Профессиональный', 'Тёмный', 'Светлый', 'Персонаж', 'Инфографика с экспертом'];
  if (!photoStyles.includes(style)) return "";
  return `
PHOTO INTEGRATION — CRITICAL:
The uploaded photos show the expert/author.
Naturally integrate her into the scene.
She physically EXISTS in this environment.
Matching lighting, shadows, color temperature.
Her feet touch the floor.
Her shadow falls naturally on the background.
Light source direction matches the scene.
Her clothing edges blend naturally with surroundings.
DO NOT cut-and-paste. DO NOT add frame or border.
Preserve exactly: face, hair, skin tone, appearance.
She was photographed IN this scene, not added later.
CONSISTENCY: Same face and hair across ALL 7 slides.
`;
}

// ─── Generate one slide image ───

async function generateOneSlideImage(
  slideNumber: number,
  title: string,
  content: string,
  style: string,
  userPhotos: string[],
  characterDescription?: string,
  autoStyleEnhancement?: string
): Promise<{ imageBase64: string; mimeType: string }> {
  const isLastSlide = slideNumber === 7;
  const isFirstSlide = slideNumber === 1;
  const styleDesc = getStyleGuide(style);
  const hasPhotos = userPhotos && userPhotos.length > 0;
  const noPersonStyles = ['Схемы & Инфографика', 'Персонаж', 'Сторителлинг'];
  const needsPhoto = !noPersonStyles.includes(style);

  const characterBlock = (style === 'Сторителлинг' && characterDescription)
    ? `\nMAIN CHARACTER CONSISTENCY:\nUse exactly this person in this slide:\n${characterDescription}\nSame face, same hair, same appearance.\nDo NOT change or replace this character.\n`
    : "";

  const photoIntegrationBlock = getPhotoIntegrationBlock(style, hasPhotos && needsPhoto);

  const styleEnhancementBlock = autoStyleEnhancement
    ? `\nTOPIC-SPECIFIC STYLE ENHANCEMENT:\n${autoStyleEnhancement}\nApply these enhancements while maintaining base style.\n`
    : "";

  const renderTextBlock = style === 'Сторителлинг'
    ? `Render this text IN the image design:\nTitle: '${title}'\nBody text: '${content || ""}'`
    : `RENDER THIS TEXT IN THE IMAGE:\nTITLE: '${title}'\nBODY: '${content || ""}'\nTypography: bold, high contrast, perfectly legible on mobile.\nALL TEXT MUST BE IN RUSSIAN ONLY.`;

  const prompt = `CRITICAL: Vertical format 1080x1350px (4:5 ratio). NOT square. NOT 1080x1080px. NEVER square.

MANDATORY VISUAL CONSISTENCY: All 7 slides must share identical color palette, lighting mood, and typography style throughout the carousel.

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

CRITICAL RULE FOR 3D ELEMENTS:
- NEVER place 3D objects near or behind the expert's head.
- 3D elements must be placed to the LEFT or RIGHT side of the frame, at chest/hand level or below.
- Keep expert's head and face completely clean — no glows, halos, or objects overlapping the face area.`;

  const parts: any[] = [];

  if (hasPhotos && needsPhoto && userPhotos.length > 0) {
    parts.push({
      inlineData: { mimeType: "image/jpeg", data: userPhotos[0] },
    });
    parts.push({
      text: `Reference person photo above. Create slide ${slideNumber} with this person featured naturally in the design.\n${prompt}`,
    });
  } else {
    parts.push({ text: prompt });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
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

async function describeCharacterFromImage(imageBase64: string, mimeType: string): Promise<string> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { inlineData: { mimeType, data: imageBase64 } },
              { text: "Describe the main character in this image in detail: hair color, hair style, hair length, face features, skin tone, age, clothing. Return only a short English description, 2-3 sentences maximum." },
            ],
          }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 256 },
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
    if (cleaned.image_base64) {
      return { imageBase64: cleaned.image_base64, mimeType: cleaned.mime_type || mimeType };
    }
    return { imageBase64, mimeType };
  } catch (e) {
    console.warn("AI Cleaner error:", e);
    return { imageBase64, mimeType };
  }
}

// ─── Main handler ───

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const { userId } = await authenticateAndCheckSubscription(req).catch((e: any) => {
      throw e;
    });

    const body = await req.json();
    const mode = body.mode || "text";

    // ─── MODE: text ───
    if (mode === "text") {
      const { userText, funnel, style } = body;
      if (!userText?.trim()) {
        return new Response(JSON.stringify({ success: false, error: "userText is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[text] Generating texts for style: ${style}`);
      const [slideContents, caption, seoMeta] = await Promise.all([
        generateSlideContent(userText, funnel || "", style || "Профессиональный"),
        generateCaption(userText, funnel || ""),
        generateSeoMeta(userText),
      ]);

      let autoStyleEnhancement = "";
      try {
        autoStyleEnhancement = await generateAutoStyleEnhancement(userText, style || "Профессиональный");
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
      console.log(`[image] Generating slide ${slideNumber} image`);

      const imageData = await generateOneSlideImage(
        slideNumber, title, content || "",
        style || "Профессиональный",
        userPhotos || [],
        characterDescription,
        autoStyleEnhancement
      );

      return new Response(JSON.stringify({
        success: true,
        imageBase64: imageData.imageBase64,
        mimeType: imageData.mimeType,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MODE: describe-character ───
    if (mode === "describe-character") {
      const { imageBase64, mimeType } = body;
      console.log("[describe-character] Extracting character description...");
      const description = await describeCharacterFromImage(imageBase64, mimeType || "image/png");
      return new Response(JSON.stringify({ success: true, description }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── MODE: clean ───
    if (mode === "clean") {
      const { imageBase64, mimeType, title, keywords } = body;
      console.log(`[clean] Cleaning slide image`);
      const cleaned = await cleanSlideImage(imageBase64, mimeType || "image/png", title || "", keywords || "");
      return new Response(JSON.stringify({
        success: true,
        imageBase64: cleaned.imageBase64,
        mimeType: cleaned.mimeType,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MODE: log ───
    if (mode === "log") {
      const { style, funnel, userText, slideCount, caption, durationMs, slidesJson, error } = body;
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
        });
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