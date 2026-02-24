import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const AI_CLEANER_API_KEY = Deno.env.get("AI_CLEANER_API_KEY");

// Generate SEO metadata using Gemini text model
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

// Clean slide image via AI Cleaner API (multipart, base64 → binary)
async function cleanSlideImage(
  imageBase64: string,
  mimeType: string,
  title: string,
  keywords: string
): Promise<{ imageBase64: string; mimeType: string }> {
  if (!AI_CLEANER_API_KEY) return { imageBase64, mimeType };
  try {
    // Convert base64 to Uint8Array binary
    const binaryStr = atob(imageBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

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
      console.warn(`AI Cleaner returned ${res.status}: ${errBody}, using original`);
      return { imageBase64, mimeType };
    }

    const contentType = res.headers.get("content-type") || "";
    
    // If API returns binary image directly (not JSON)
    if (contentType.startsWith("image/")) {
      const buffer = await res.arrayBuffer();
      const cleanedBytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < cleanedBytes.length; i++) {
        binary += String.fromCharCode(cleanedBytes[i]);
      }
      const returnMime = contentType.split(";")[0].trim() || mimeType;
      console.log(`AI Cleaner: slide cleaned successfully (binary ${returnMime}, ${cleanedBytes.length} bytes)`);
      return { imageBase64: btoa(binary), mimeType: returnMime };
    }

    // If API returns JSON with download_url or base64
    const rawBody = await res.text();
    let cleaned: any;
    try {
      cleaned = JSON.parse(rawBody);
    } catch {
      // Not JSON and not image — could be raw binary without proper content-type
      // Try treating as binary image
      const buffer = new TextEncoder().encode(rawBody);
      if (buffer.length > 1000 && rawBody.charCodeAt(0) === 0xFF && rawBody.charCodeAt(1) === 0xD8) {
        // JPEG magic bytes detected
        let binary = "";
        for (let i = 0; i < buffer.length; i++) {
          binary += String.fromCharCode(buffer[i]);
        }
        console.log(`AI Cleaner: slide cleaned (raw JPEG detected, ${buffer.length} bytes)`);
        return { imageBase64: btoa(binary), mimeType: "image/jpeg" };
      }
      console.warn("AI Cleaner returned unknown format, using original");
      return { imageBase64, mimeType };
    }

    if (cleaned.download_url) {
      console.log(`AI Cleaner: fetching cleaned file from ${cleaned.download_url}`);
      const fileRes = await fetch(cleaned.download_url);
      if (!fileRes.ok) {
        console.warn(`AI Cleaner download failed: ${fileRes.status}`);
        return { imageBase64, mimeType };
      }
      const buffer = await fileRes.arrayBuffer();
      const cleanedBytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < cleanedBytes.length; i++) {
        binary += String.fromCharCode(cleanedBytes[i]);
      }
      console.log(`AI Cleaner: slide cleaned successfully via download_url`);
      return { imageBase64: btoa(binary), mimeType };
    }
    if (cleaned.image_base64) {
      console.log(`AI Cleaner: slide cleaned successfully via base64`);
      return { imageBase64: cleaned.image_base64, mimeType: cleaned.mime_type || mimeType };
    }

    console.warn("AI Cleaner: response has no download_url or image_base64, using original");
    return { imageBase64, mimeType };
  } catch (e) {
    console.warn("AI Cleaner error, using original:", e);
    return { imageBase64, mimeType };
  }
}

// Generate slide content (text only) using Gemini text model
async function generateSlideContent(
  userText: string,
  funnel: string,
  style: string
): Promise<{ title: string; content: string }[]> {
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
- Заголовок: 2-3 строки, до 80 символов.
  Вызывает реакцию: "это про меня", "надо глянуть", "что за фигня?"
  Содержит крючок, вопрос, обещание или контраст.
- Подзаголовок: 1-2 строки, пояснение или интрига.

СЛАЙДЫ 2-6 — КОНТЕНТ (каждый слайд = 1 мысль):
- Заголовок: 1 строка, ёмкий, с глаголом действия.
  Может быть вопросом, провокацией, парадоксом.
- Текст: Полные предложения с объяснениями.
  Живой, разговорный, с дыханием и эмоцией.
  Конкретные примеры, цифры, детали.
  Рассказывай КАК и ПОЧЕМУ, а не только ЧТО.
  Каждый слайд заканчивается так, чтобы
  хотелось листать дальше (эффект скользкой горки).

СЛАЙД 7 — ПРИЗЫВ:
- Используй точно эту воронку: ${funnelText}
- Коротко, конкретно, без давления.

═══════════════════════════════════
ЗАПРЕЩЕНО:
═══════════════════════════════════
- Списки из коротких фраз без объяснений
- Телеграфный стиль ("• создаю базу • получаю результат")
- Сухие перечисления без раскрытия
- Обрывочные фразы вместо полных мыслей
- Банальности типа "будьте позитивными"
- Канцелярит и сложные термины
- Слово "эксперт", "контент", "полезно"

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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nТекст пользователя:\n${userText}` }] }],
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

// Generate caption (post description) using Gemini text model
async function generateCaption(
  userText: string,
  funnel: string,
): Promise<string> {
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

  if (!response.ok) {
    console.warn(`Caption API error ${response.status}, returning empty`);
    return "";
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

// Robust JSON parser with fallback
function parseJsonResponse(rawText: string): any {
  const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn("Direct JSON parse failed, attempting extraction...");
    const match = cleaned.match(/[\[\{][\s\S]*[\]\}]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        const fixed = match[0]
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]")
          .replace(/[\x00-\x1F\x7F]/g, (ch) => ch === '\n' || ch === '\t' ? ch : "");
        try {
          return JSON.parse(fixed);
        } catch (e3) {
          throw new Error(`Failed to parse Gemini response: ${cleaned.substring(0, 200)}`);
        }
      }
    }
    throw new Error(`Invalid JSON from Gemini: ${cleaned.substring(0, 200)}`);
  }
}

// Extract character description from a generated image (for storytelling consistency)
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
    if (!response.ok) {
      console.warn(`Character description API error: ${response.status}`);
      return "";
    }
    const data = await response.json();
    const desc = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    console.log(`Character description extracted: ${desc.substring(0, 100)}...`);
    return desc;
  } catch (e) {
    console.warn("Failed to extract character description:", e);
    return "";
  }
}

// Generate image for a slide using Gemini imagen
async function generateSlideImage(
  slideNumber: number,
  title: string,
  content: string,
  style: string,
  userPhotos: string[],
  characterDescription?: string
): Promise<{ imageBase64: string; mimeType: string }> {
  const isLastSlide = slideNumber === 7;
  const isFirstSlide = slideNumber === 1;

  function getStyleGuide(s: string): string {
    const styles: Record<string, string> = {
      'Профессиональный': `
CRITICAL RULE — PERSON IN SLIDES:
Use ONLY the photo uploaded by the user.
Preserve exactly: face, hair, skin, appearance.
If no photo uploaded — leave person area empty.

FORMAT: 1080x1350px vertical (4:5). NOT square.

VISUAL STYLE: Professional Psychology Office.
SCENE: Real cozy psychology office interior.
Warm neutral tones — beige, ivory, sage green.
Natural light from window.
Room elements: armchair, bookshelf with books,
indoor plants, soft lamp, wooden desk, notepad.
Atmosphere: safe, calm, professional warmth.

PERSON: She is NATURALLY IN THE SCENE —
not a cutout. Photographed IN this office.
Warm natural light falls on her.

POSES — vary per slide:
Slide 1: sitting in armchair, notepad in lap
Slide 2: standing by window, soft light behind
Slide 3: sitting at desk with laptop, looking up
Slide 4: standing near bookshelf, arms relaxed
Slide 5: sitting in armchair, tablet in hands
Slide 6: sitting at desk, pen in hand
Slide 7: warm smile, inviting gesture

TEXT: top area of image, white rounded card.
Headlines: deep burgundy (#8B1A1A), bold serif.
Accent: warm gold (#C9A84C).
Thin gold geometric lines in corners.
NO plain gradient background.
NO yellow circles or blobs.

FORMAT: 1080x1350px vertical (4:5 ratio).
NOT square. NOT 1080x1080px.`,

      'Светлый': `
CRITICAL RULE — PERSON IN SLIDES:
Use ONLY the photo uploaded by the user.
Do NOT generate, replace or modify the person.
Do NOT create a random or different woman.
Preserve exactly: face, hair, skin, appearance.
If no photo uploaded — leave person area empty,
do not substitute with any generated person.

VISUAL STYLE: Light Premium Editorial — magazine cover style.
COLOR VARIATION RULE:
Each slide — choose ONE background tone from warm light family:
peach / cream / blush / ivory / warm white.
Each slide different tone within this family.
Accent: one tone from warm medium family:
coral / salmon / terracotta / dusty rose.
Vary slightly slide to slide.
ONE thin coral line along RIGHT edge only. NO random geometric shapes floating.
Colors: Dark navy (#1A2B4A) main headlines, coral accent word or line, gray body text.
Typography: Very large bold condensed sans-serif headlines stacked in 3-4 lines left-aligned.
Massive size contrast between headline and body text.
Person placement: RIGHT half of image, large, bottom-aligned, slightly cut at knees. Takes up 55% of width.
Text placement: LEFT 45% of image, stacked vertically, lots of breathing room between elements.
Atmosphere: Premium editorial fashion magazine — Vogue or Harper Bazaar aesthetic. Clean, intentional.
Person and text overlap slightly at shoulder zone.

FORMAT: 1080x1350px vertical (4:5 ratio).
NOT square. NOT 1080x1080px.`,

      'Инфографика с экспертом': `
CRITICAL RULE — PERSON IN SLIDES:
Use ONLY the photo uploaded by the user.
Do NOT generate, replace or modify the person.
Do NOT create a random or different woman.
Preserve exactly: face, hair, skin, appearance.
If no photo uploaded — leave person area empty,
do not substitute with any generated person.

VISUAL STYLE: Expert Infographic — educational and engaging.
COLOR VARIATION RULE:
Background: pure white (#FFFFFF) only.
No mint, no green, no teal tones ever.
Accent: bright tone from blue/green/coral family,
vary per slide to keep energy fresh.
PERSON: Place expert in CENTER or LEFT of image.
Expert physically holds or interacts with REAL PROPS relevant to the slide topic — food, objects, documents, tools.
Props appear naturally in expert's hands or on table in front.
INFOGRAPHIC ELEMENTS: Place diagrams, charts, comparison tables, icons, arrows, checkmarks to the RIGHT of or around the expert.
Elements show data visually — before/after, pros/cons, step-by-step, comparison columns.
Scene: Expert in relevant environment — kitchen, office, classroom, outdoors — matching the content topic.
Atmosphere: Educational, trustworthy, friendly expert sharing knowledge. Like a premium health or science blog.`,

      'Тёмный': `
CRITICAL RULE — PERSON IN SLIDES:
Use ONLY the photo uploaded by the user.
Do NOT generate, replace or modify the person.
Do NOT create a random or different woman.
Preserve exactly: face, hair, skin, appearance.
If no photo uploaded — leave person area empty,
do not substitute with any generated person.

VISUAL STYLE: Cinematic Warm Dark — premium psychology brand.
NO white backgrounds. NO infographics. NO diagrams.
NO 3D floating objects. NO glowing chains or stars.
Pure cinematic atmospheric photography.
COLOR PALETTE: Deep warm darks — burgundy (#3D0C11), rich amber, candlelight gold, soft warm shadows.
Text: warm gold serif for headlines, soft white for body.
PERSON: Extract from uploaded photo if provided.
She must be INSIDE THE SCENE — physically part of the environment, not a cutout overlay.
Preserve exact face and appearance. Warm cinematic light falls on her naturally.
Different atmospheric scene each slide.
SCENES TO USE (rotate per slide):
- Evening armchair near rainy window, candle, lamp, books
- Standing at tall window, autumn park outside, silhouette
- Wooden desk with single candle, dark library behind
- Walking through autumn park at dusk, golden leaves
- Morning window with tea, plants, soft golden light
- Deep armchair, amber lamp light, looking upward
- Doorway between dark room and warm lit corridor
TEXT placement: on naturally dark areas of the photo.
Never on bright areas. Text must be readable.
Gold serif for headline. White for body text.
ATMOSPHERE: Cinematic, emotional, premium therapy brand.
Like a luxury film still. Intimate, wise, safe presence.
NO clinical coldness. NO flat design elements.`,

      'Персонаж': `
CRITICAL RULE — CHARACTER CREATION:
Use ONLY the photo uploaded by the user
as the BASE for creating the 3D character.
Preserve: face shape, hair color, skin tone,
general appearance — transform to Pixar/Disney
3D style but keep person recognizable.
Do NOT create a random character.

CRITICAL — CHARACTER CONSISTENCY:
Generate a detailed character description
on slide 1 and store it as reference.
Character: brown-haired woman,
Pixar/Disney 3D style, professional look.
On slides 2-7: COPY EXACTLY the character
from slide 1. Same face, same hair length,
same hair color, same skin tone.
Clothing COLOR may vary per slide,
but style stays professional.
DO NOT change face or hair between slides.

FORMAT: 1080x1350px vertical (4:5 ratio).
NOT square. NOT 1080x1080px.

VISUAL STYLE: 3D Pixar/Disney character style.
Background: pure white (#FFFFFF) only.
NO gradients. NO cream. NO mint. NO lavender.
NO purple. NO blue. NO teal. White only.
Typography: Rounded bold sans-serif.
3D elements: Floating icons at chest/hand level,
NEVER near face.
Atmosphere: Approachable, modern, premium.`,

      'Схемы & Инфографика': `
FORMAT: 1080x1350px vertical (4:5 ratio). NOT square.
VISUAL STYLE: Clean Data Infographic. NO person needed.
COLOR VARIATION RULE:
Background: clean light tone, vary per slide:
white / off-white / light gray only.
Accent: professional tone from:
navy / teal / slate / deep blue family.
Warning elements: warm tone from:
coral / red-orange / salmon family.
Typography: Bold modern Montserrat-style sans-serif.
Visual elements: Clean diagrams, arrows, comparison tables, numbered steps with icons, progress bars, before/after splits.
Atmosphere: Educational, authoritative, consulting quality.
When relevant — embed real photo in a rounded card/frame in upper half, infographic elements in lower half.
Dark navy background (#0D1B2A) throughout.`,

      'Сторителлинг': `
Generate ONE hyperrealistic photographic image (4:5 ratio, 1080x1350px).
Style: Cinematic photography, Sony A7R, 35mm f/2.0.
Real people, real locations. NOT illustration, NOT cartoon.
For each slide — illustrate the EXACT SCENE described in the slide content.
Characters must stay CONSISTENT across all slides (same faces, clothes, hair throughout the carousel).

Render this text IN the image design:
Title: '${title}'
Body text: '${content || ""}'

TEXT PLACEMENT:
- Bottom: Floating semi-transparent rounded rectangular glassmorphism plate (blur background).
- Plate background: rgba(0,0,0,0.4).
- Position: Bottom center, slightly above the bottom edge.
- Width: ~90% of frame width.
- Line 1: headline — white bold 32px, always in quotes like «Headline».
- Lines 2-3: body text — white italic 24px, positioned below headline.
- Do NOT show raw labels like "TITLE:" or "BODY:" — render the text naturally as part of the design.
SLIDE 1 ONLY: Large coral/peach colored text on the right side: ЛИСТАЙ → (bold, 50px).
Slides 1-7: Small dark-grey rounded pill in top-right corner containing white text: X/7 (e.g. 1/7, 2/7).
Lighting: warm cinematic sunset lighting (golden hour).
Each scene: dramatically expressive characters, emotions readable.
Depth of field — foreground sharp, background soft bokeh.`,
    };
    return styles[s] || styles['Профессиональный'];
  }

  const styleDesc = getStyleGuide(style);
  const hasPhotos = userPhotos && userPhotos.length > 0;
  const noPersonStyles = ['Схемы & Инфографика', 'Персонаж', 'Сторителлинг'];
  const needsPhoto = !noPersonStyles.includes(style);

  // Build character consistency block for storytelling
  const characterBlock = (style === 'Сторителлинг' && characterDescription)
    ? `\nMAIN CHARACTER CONSISTENCY:\nUse exactly this person in this slide:\n${characterDescription}\nSame face, same hair, same appearance.\nDo NOT change or replace this character.\n`
    : "";

  const prompt = `MANDATORY VISUAL CONSISTENCY: All 7 slides must share identical color palette, lighting mood, and typography style throughout the carousel.
${characterBlock}
Instagram carousel slide ${slideNumber} of 7.
${isFirstSlide ? "This is the COVER slide — make it eye-catching and bold." : ""}
${isLastSlide ? "This is the CTA slide — make it action-oriented with clear call to action." : ""}
${hasPhotos && needsPhoto ? "Include a person in the slide that matches the uploaded reference photo." : ""}
Vertical format 1080x1350px (4:5 ratio). NOT square. Professional social media post, high quality, modern design.
Do NOT add any borders or watermarks.

RENDER THIS TEXT IN THE IMAGE:
TITLE: '${title}'
BODY: '${content || ""}'
Typography: bold, high contrast, perfectly legible on mobile.

STYLE GUIDE:
${styleDesc}

CRITICAL RULE FOR 3D ELEMENTS:
- NEVER place 3D objects near or behind the expert's head.
- 3D elements must be placed to the LEFT or RIGHT side of the frame, at chest/hand level or below — never at head level.
- Elements should appear to rest on a surface OR float beside the expert's hands, not behind her.
- Keep expert's head and face completely clean — no glows, halos, or objects overlapping the face area.`;

  // Build parts array
  const parts: any[] = [];

  // Add reference photos if available and style supports them
  if (hasPhotos && needsPhoto && userPhotos.length > 0) {
    // Use first photo as reference
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: userPhotos[0],
      },
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
      return {
        imageBase64: part.inlineData.data,
        mimeType: part.inlineData.mimeType || "image/png",
      };
    }
  }

  throw new Error(`No image returned for slide ${slideNumber}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    // ── Auth check: only authenticated users can generate ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Check active subscription ──
    const userId = claimsData.claims.sub;
    const { data: sub } = await supabaseClient
      .from("subscriptions")
      .select("expires_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (!sub || new Date(sub.expires_at) <= new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: "Subscription required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { userText, funnel, style, userPhotos } = await req.json();

    if (!userText || !userText.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: "userText is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Generating slides for style: ${style}`);
    const startTime = Date.now();

    // Step 1: Generate slide content (text), caption, and SEO meta in parallel
    const [slideContents, caption, seoMeta] = await Promise.all([
      generateSlideContent(userText, funnel || "", style || "Профессиональный"),
      generateCaption(userText, funnel || ""),
      generateSeoMeta(userText),
    ]);

    console.log(`Generated ${slideContents.length} slide texts, caption: ${caption.length} chars, SEO: ${seoMeta.title}`);

    // Step 2: Generate images
    const maxSlides = slideContents.slice(0, 7);
    const isStorytelling = (style || "Профессиональный") === "Сторителлинг";
    let rawSlides: { index: number; title: string; content: string; imageBase64: string; mimeType: string; error?: string }[];

    if (isStorytelling) {
      // STORYTELLING: 2-stage generation for character consistency
      console.log("Storytelling mode: generating slide 1 first for character extraction...");
      
      // Stage 1: Generate slide 1
      let slide1Data: { imageBase64: string; mimeType: string };
      let characterDescription = "";
      try {
        slide1Data = await generateSlideImage(1, maxSlides[0].title, maxSlides[0].content, style!, userPhotos || []);
        console.log("Slide 1 generated, extracting character description...");
        characterDescription = await describeCharacterFromImage(slide1Data.imageBase64, slide1Data.mimeType);
      } catch (err) {
        console.error("Error generating storytelling slide 1:", err);
        slide1Data = { imageBase64: "", mimeType: "image/png" };
      }

      // Stage 2: Generate slides 2-7 in parallel with character description
      console.log(`Generating slides 2-7 in parallel with character lock: "${characterDescription.substring(0, 80)}..."`);
      const remainingSlides = await Promise.all(
        maxSlides.slice(1).map(async (slide, i) => {
          const slideNum = i + 2;
          try {
            const imageData = await generateSlideImage(slideNum, slide.title, slide.content, style!, userPhotos || [], characterDescription);
            console.log(`Slide ${slideNum} generated`);
            return { index: i + 1, title: slide.title, content: slide.content, ...imageData };
          } catch (err) {
            console.error(`Error generating slide ${slideNum}:`, err);
            return { index: i + 1, title: slide.title, content: slide.content, imageBase64: "", mimeType: "image/png", error: err instanceof Error ? err.message : "Image generation failed" };
          }
        })
      );

      rawSlides = [
        { index: 0, title: maxSlides[0].title, content: maxSlides[0].content, ...slide1Data },
        ...remainingSlides,
      ];
    } else {
      // ALL OTHER STYLES: parallel generation
      console.log("Generating all slide images in parallel...");
      rawSlides = await Promise.all(
        maxSlides.map(async (slide, i) => {
          try {
            const imageData = await generateSlideImage(i + 1, slide.title, slide.content, style || "Профессиональный", userPhotos || []);
            console.log(`Slide ${i + 1} generated`);
            return { index: i, title: slide.title, content: slide.content, ...imageData };
          } catch (err) {
            console.error(`Error generating slide ${i + 1}:`, err);
            return { index: i, title: slide.title, content: slide.content, imageBase64: "", mimeType: "image/png", error: err instanceof Error ? err.message : "Image generation failed" };
          }
        })
      );
    }

    // Step 3: Clean ALL slides in parallel via AI Cleaner
    console.log("Cleaning all slides in parallel...");
    let cleanedCount = 0;
    let cleanFailedCount = 0;
    const slideResults = await Promise.all(
      rawSlides.map(async (slide) => {
        if (slide.error || !slide.imageBase64) {
          return { slideNumber: slide.index + 1, title: slide.title, content: slide.content, imageBase64: slide.imageBase64, mimeType: slide.mimeType, error: slide.error };
        }
        const original = slide.imageBase64;
        const cleaned = await cleanSlideImage(slide.imageBase64, slide.mimeType, seoMeta.title, seoMeta.keywords);
        if (cleaned.imageBase64 !== original) {
          cleanedCount++;
          console.log(`Slide ${slide.index + 1} cleaned successfully`);
        } else {
          cleanFailedCount++;
          console.warn(`Slide ${slide.index + 1} NOT cleaned (returned original)`);
        }
        return { slideNumber: slide.index + 1, title: slide.title, content: slide.content, imageBase64: cleaned.imageBase64, mimeType: cleaned.mimeType };
      })
    );

    const durationMs = Date.now() - startTime;

    // Count errors
    const imageErrors = slideResults.filter(s => s.error || !s.imageBase64).length;
    const summaryError = imageErrors > 0
      ? `${imageErrors}/${slideResults.length} slides failed image generation`
      : null;

    console.log(`Summary: ${slideResults.length} slides, ${imageErrors} image errors, ${cleanedCount} cleaned, ${cleanFailedCount} clean failed, ${durationMs}ms`);

    // Save generation log (without base64 images to save space)
    const slidesForLog = slideResults.map(({ imageBase64: _, ...rest }) => rest);
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
        slide_count: slideResults.length,
        caption,
        duration_ms: durationMs,
        slides_json: slidesForLog,
        error: summaryError,
      });
      console.log(`Generation log saved (${durationMs}ms)`);
    } catch (logErr) {
      console.error("Failed to save generation log:", logErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        slides: slideResults,
        caption,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("generate-slides error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
