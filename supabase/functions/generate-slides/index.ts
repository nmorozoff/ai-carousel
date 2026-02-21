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
    formData.append("image", new Blob([bytes], { type: mimeType }), `slide.${ext}`);
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
      console.warn(`AI Cleaner returned ${res.status}, using original`);
      return { imageBase64, mimeType };
    }

    const cleaned = await res.json();
    // If API returns download_url — fetch and re-encode to base64
    if (cleaned.download_url) {
      const fileRes = await fetch(cleaned.download_url);
      if (!fileRes.ok) return { imageBase64, mimeType };
      const buffer = await fileRes.arrayBuffer();
      const cleanedBytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < cleanedBytes.length; i++) {
        binary += String.fromCharCode(cleanedBytes[i]);
      }
      return { imageBase64: btoa(binary), mimeType };
    }
    // If API returns base64 directly
    if (cleaned.image_base64) {
      return { imageBase64: cleaned.image_base64, mimeType: cleaned.mime_type || mimeType };
    }

    return { imageBase64, mimeType };
  } catch (e) {
    console.warn("AI Cleaner error, using original:", e);
    return { imageBase64, mimeType };
  }
}

// Generate slide content (text) using Gemini text model
async function generateSlideContent(
  userText: string,
  funnel: string,
  style: string
): Promise<{ slides: { title: string; content: string }[]; caption: string }> {
  const slidePrompt = `Ты — эксперт по созданию карусельных постов для Instagram/ВКонтакте.
Создай 7 слайдов карусели на основе текста пользователя.

Стиль оформления: ${style}

Требования к слайдам:
- Слайд 1: Цепляющий заголовок (hook) — максимум 7 слов
- Слайды 2-6: Полезный контент, тезисы, ключевые мысли. Каждый слайд — 1-2 коротких предложения
- Слайд 7: Призыв к действию (CTA)${funnel ? `: ${funnel}` : " — подбери сам по теме"}`;

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

Объём: 800-1000 символов.
Выдай только готовый текст. Без пояснений.`;

  const systemPrompt = `${slidePrompt}

Также создай описание к посту (caption) для Instagram по следующим правилам:
${captionPrompt}

Верни строго JSON без markdown блоков:
{
  "slides": [
    {"title": "...", "content": "..."},
    ...
  ],
  "caption": "..."
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${systemPrompt}\n\nТекст пользователя:\n${userText}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini text API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Strip markdown code blocks if present
  const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error("Failed to parse Gemini response as JSON: " + cleaned.slice(0, 200));
  }
}

// Generate image for a slide using Gemini imagen
async function generateSlideImage(
  slideNumber: number,
  title: string,
  content: string,
  style: string,
  userPhotos: string[]
): Promise<{ imageBase64: string; mimeType: string }> {
  const isLastSlide = slideNumber === 7;
  const isFirstSlide = slideNumber === 1;

  function getStyleGuide(s: string): string {
    const styles: Record<string, string> = {
      'Профессиональный': `
VISUAL STYLE: Warm Classic Premium.
Background: Soft warm cream (#FAF7F2) with subtle warm gradient.
Colors: Deep burgundy (#8B1A1A) for headlines, warm gold (#C9A84C) accents, dark brown body text.
Typography: Elegant bold serif headlines, clean sans-serif body.
Lighting: Soft natural warm golden light. Studio quality.
Decorative: Thin gold geometric lines in corners.
Atmosphere: Warm, trustworthy, professional wellness brand.
Person placement: Lower center, integrated into warm scene.`,

      'Светлый': `
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
Person and text overlap slightly at shoulder zone.`,

      'Инфографика с экспертом': `
VISUAL STYLE: Expert Infographic — educational and engaging.
COLOR VARIATION RULE:
Background: clean light tone, vary per slide:
white / light blue / light mint / warm white.
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
VISUAL STYLE: 3D Illustrated Character — NO real person photo needed.
Create a stylized friendly 3D cartoon avatar. Professional outfit, warm expressive face.
COLOR VARIATION RULE:
Each slide background — soft pastel gradient,
vary the tone each slide:
alternate between: sky blue, mint, peach,
lavender, warm cream — each fading → white.
Accent elements complement the background tone.
Typography: Rounded friendly bold sans-serif.
3D elements: Floating speech bubbles, lightbulbs, hearts, stars — placed at chest/hand level, NEVER near face.
Atmosphere: Approachable, modern, premium app illustration.
CRITICAL: No real photo needed — generate a stylized 3D avatar character automatically.`,

      'Схемы & Инфографика': `
VISUAL STYLE: Clean Data Infographic. NO person needed.
COLOR VARIATION RULE:
Background: clean light tone, vary per slide:
white / off-white / light gray / pale blue.
Accent: professional tone from:
navy / teal / slate / deep blue family.
Warning elements: warm tone from:
coral / red-orange / salmon family.
Typography: Bold modern Montserrat-style sans-serif.
Visual elements: Clean diagrams, arrows, comparison tables, numbered steps with icons, progress bars, before/after splits.
Atmosphere: Educational, authoritative, consulting quality.`,

      'Сторителлинг': `
Generate ONE hyperrealistic photographic image (4:5 ratio, 1080x1350px).
Style: Cinematic photography, Sony A7R, 35mm f/2.0.
Real people, real locations. NOT illustration, NOT cartoon.
For each slide — illustrate the EXACT SCENE described in the slide content.
Characters must stay CONSISTENT across all slides (same faces, clothes, hair throughout the carousel).
TEXT PLACEMENT:
- Bottom: Floating semi-transparent rounded rectangular glassmorphism plate (blur background).
- Plate background: rgba(0,0,0,0.4).
- Position: Bottom center, slightly above the bottom edge.
- Width: ~90% of frame width.
- Line 1: headline — white bold 32px, always in quotes like «Headline».
- Lines 2-3: body text — white italic 24px, positioned below headline.
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

  const prompt = `Instagram carousel slide ${slideNumber} of 7.
${isFirstSlide ? "This is the COVER slide — make it eye-catching and bold." : ""}
${isLastSlide ? "This is the CTA slide — make it action-oriented with clear call to action." : ""}
Title text on slide: "${title}"
${content ? `Body text: "${content}"` : ""}
${hasPhotos && needsPhoto ? "Include a person in the slide that matches the uploaded reference photo." : ""}
Square format 1080x1080, professional social media post, high quality, text clearly readable, modern design.
Do NOT add any borders or watermarks.

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

    // Step 1: Generate slide content (text) + SEO meta in parallel
    const [{ slides: slideContents, caption }, seoMeta] = await Promise.all([
      generateSlideContent(userText, funnel || "", style || "Профессиональный"),
      generateSeoMeta(userText),
    ]);

    console.log(`Generated ${slideContents.length} slide texts, SEO: ${seoMeta.title}`);

    // Step 2: Generate images sequentially (to avoid Gemini rate limits)
    const rawSlides: { index: number; title: string; content: string; imageBase64: string; mimeType: string; error?: string }[] = [];

    for (let i = 0; i < slideContents.length; i++) {
      const slide = slideContents[i];
      try {
        const imageData = await generateSlideImage(
          i + 1,
          slide.title,
          slide.content,
          style || "Профессиональный",
          userPhotos || []
        );
        rawSlides.push({ index: i, title: slide.title, content: slide.content, ...imageData });
        console.log(`Slide ${i + 1} generated`);
      } catch (err) {
        console.error(`Error generating slide ${i + 1}:`, err);
        rawSlides.push({
          index: i, title: slide.title, content: slide.content,
          imageBase64: "", mimeType: "image/png",
          error: err instanceof Error ? err.message : "Image generation failed",
        });
      }
    }

    // Step 3: Clean ALL slides in parallel via AI Cleaner
    console.log("Cleaning all slides in parallel...");
    const slideResults = await Promise.all(
      rawSlides.map(async (slide) => {
        if (slide.error || !slide.imageBase64) {
          return { slideNumber: slide.index + 1, title: slide.title, content: slide.content, imageBase64: slide.imageBase64, mimeType: slide.mimeType, error: slide.error };
        }
        const cleaned = await cleanSlideImage(slide.imageBase64, slide.mimeType, seoMeta.title, seoMeta.keywords);
        console.log(`Slide ${slide.index + 1} cleaned`);
        return { slideNumber: slide.index + 1, title: slide.title, content: slide.content, imageBase64: cleaned.imageBase64, mimeType: cleaned.mimeType };
      })
    );

    const durationMs = Date.now() - startTime;

    // Step 3: Save generation log (without base64 images to save space)
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
