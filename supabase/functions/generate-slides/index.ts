import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

// Generate slide content (text) using Gemini text model
async function generateSlideContent(
  userText: string,
  funnel: string,
  style: string
): Promise<{ slides: { title: string; content: string }[]; caption: string }> {
  const systemPrompt = `Ты — эксперт по созданию карусельных постов для Instagram/ВКонтакте.
Создай 7 слайдов карусели на основе текста пользователя.

Стиль оформления: ${style}

Требования к слайдам:
- Слайд 1: Цепляющий заголовок (hook) — максимум 7 слов
- Слайды 2-6: Полезный контент, тезисы, ключевые мысли. Каждый слайд — 1-2 коротких предложения
- Слайд 7: Призыв к действию (CTA)${funnel ? `: ${funnel}` : " — подбери сам по теме"}

Также создай описание к посту (caption) для Instagram/ВКонтакте: 3-5 предложений с эмодзи и хэштегами.

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
      'Классический тёплый': `
VISUAL STYLE: Warm Classic Premium.
Background: Soft warm cream (#FAF7F2) with subtle warm gradient.
Colors: Deep burgundy (#8B1A1A) for headlines, warm gold (#C9A84C) accents, dark brown body text.
Typography: Elegant bold serif headlines, clean sans-serif body.
Lighting: Soft natural warm golden light. Studio quality.
Decorative: Thin gold geometric lines in corners.
Atmosphere: Warm, trustworthy, professional wellness brand.
Person placement: Lower center, integrated into warm scene.`,
      'Светлый Editorial': `
VISUAL STYLE: Light Premium Editorial — magazine cover style.
Background: Warm white (#FAFAF8) top, soft peach-beige gradient (#F5EDE4) at bottom.
ONE thin coral (#D4614A) line along RIGHT edge only. NO random geometric shapes floating.
Colors: Dark navy (#1A2B4A) main headlines, coral (#D4614A) accent word or line, gray body text.
Typography: Very large bold condensed sans-serif headlines stacked in 3-4 lines left-aligned.
Massive size contrast between headline and body text.
Person placement: RIGHT half of image, large, bottom-aligned, slightly cut at knees. Takes up 55% of width.
Text placement: LEFT 45% of image, stacked vertically, lots of breathing room between elements.
Atmosphere: Premium editorial fashion magazine — Vogue or Harper Bazaar aesthetic. Clean, intentional.
Person and text overlap slightly at shoulder zone.`,
      'Инфографика с экспертом': `
VISUAL STYLE: Expert Infographic — educational and engaging.
Background: Clean white (#FFFFFF) or very light gray (#F8F8F8).
Accent colors: Bright blue (#2196F3) or green (#4CAF50) for positive elements, red (#F44336) for negative/warning.
Typography: Bold modern sans-serif headlines at top. Smaller readable body text at bottom.
PERSON: Place expert in CENTER or LEFT of image.
Expert physically holds or interacts with REAL PROPS relevant to the slide topic — food, objects, documents, tools.
Props appear naturally in expert's hands or on table in front.
INFOGRAPHIC ELEMENTS: Place diagrams, charts, comparison tables, icons, arrows, checkmarks to the RIGHT of or around the expert.
Elements show data visually — before/after, pros/cons, step-by-step, comparison columns.
Scene: Expert in relevant environment — kitchen, office, classroom, outdoors — matching the content topic.
Atmosphere: Educational, trustworthy, friendly expert sharing knowledge. Like a premium health or science blog.`,
      'Тёмный': `
VISUAL STYLE: Dark Gold Premium.
Background: Deep matte black (#0D0D0D) with subtle diagonal gold geometric lines at 30% opacity.
Gold star light flares in upper corners.
Colors: Gold (#C9A84C) for headlines, white for body text.
Typography: Bold uppercase sans-serif headlines in gold.
Lighting: Dramatic cinematic studio — golden rim light from behind, deep shadows.
3D elements: Volumetric gold 3D objects floating to LEFT or RIGHT side at chest level only.
NEVER place 3D objects near or behind expert's head.
Person placement: Lower center or right, large.
Atmosphere: Luxurious, authoritative, premium business.`,
      'Иллюстрированный персонаж': `
VISUAL STYLE: 3D Illustrated Character.
If person photo provided — create stylized 3D cartoon avatar resembling them. Professional outfit, warm expressive face.
Background: Clean white or soft pastel gradient.
Colors: Soft pastels with coral, mint, lavender accents.
Typography: Rounded friendly bold sans-serif.
3D elements: Floating speech bubbles, lightbulbs, hearts, stars.
Atmosphere: Approachable, modern, premium app illustration.`,
      'Схемы & Инфографика': `
VISUAL STYLE: Clean Data Infographic. NO person needed.
Background: Pure white (#FFFFFF).
Colors: Coral (#FF6B6B) and dark navy (#1A2B4A).
Typography: Bold modern Montserrat-style sans-serif.
Visual elements: Clean diagrams, arrows, comparison tables, numbered steps with icons, progress bars, before/after splits.
Atmosphere: Educational, authoritative, consulting quality.`,
    };
    return styles[s] || styles['Классический тёплый'];
  }

  const styleDesc = getStyleGuide(style);
  const hasPhotos = userPhotos && userPhotos.length > 0;

  const prompt = `Instagram carousel slide ${slideNumber} of 7.
${isFirstSlide ? "This is the COVER slide — make it eye-catching and bold." : ""}
${isLastSlide ? "This is the CTA slide — make it action-oriented with clear call to action." : ""}
Title text on slide: "${title}"
${content ? `Body text: "${content}"` : ""}
${hasPhotos && style !== "Схемы & Инфографика" ? "Include a person in the slide that matches the uploaded reference photo." : ""}
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
  if (hasPhotos && style !== "Схемы & Инфографика" && userPhotos.length > 0) {
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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${GEMINI_API_KEY}`,
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

    // Step 1: Generate slide content (text)
    const { slides: slideContents, caption } = await generateSlideContent(
      userText,
      funnel || "",
      style || "Классический тёплый"
    );

    console.log(`Generated ${slideContents.length} slide texts`);

    // Step 2: Generate images sequentially (to avoid rate limits)
    const slideResults = [];

    for (let i = 0; i < slideContents.length; i++) {
      const slide = slideContents[i];
      try {
        const imageData = await generateSlideImage(
          i + 1,
          slide.title,
          slide.content,
          style || "Классический тёплый",
          userPhotos || []
        );

        slideResults.push({
          slideNumber: i + 1,
          title: slide.title,
          content: slide.content,
          imageBase64: imageData.imageBase64,
          mimeType: imageData.mimeType,
        });

        console.log(`Slide ${i + 1} generated`);
      } catch (err) {
        console.error(`Error generating slide ${i + 1}:`, err);
        slideResults.push({
          slideNumber: i + 1,
          title: slide.title,
          content: slide.content,
          imageBase64: "",
          mimeType: "image/png",
          error: err instanceof Error ? err.message : "Image generation failed",
        });
      }
    }

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
        style: style || "Классический тёплый",
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
