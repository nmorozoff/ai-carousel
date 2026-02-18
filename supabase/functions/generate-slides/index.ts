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

  const styleDescriptions: Record<string, string> = {
    "Классический тёплый":
      "warm tones, beige and cream background, elegant serif typography, professional lifestyle feel, cozy and inviting",
    "Иллюстрированный персонаж":
      "illustrated 3D cartoon character style, vibrant colors, playful and modern, character-driven visual",
    "Схемы & Инфографика":
      "clean infographic style, white background, colorful icons and charts, minimal and data-driven, no faces",
    "Светлый":
      "bright white background, modern sans-serif typography, clean minimal layout, airy and spacious",
    "Тёмный":
      "dark background (#1a1a2e or #0d0d0d), neon accents, premium dark mode aesthetic, bold typography",
  };

  const styleDesc = styleDescriptions[style] || styleDescriptions["Классический тёплый"];

  const hasPhotos = userPhotos && userPhotos.length > 0;

  const prompt = `Instagram carousel slide ${slideNumber} of 7.
Style: ${styleDesc}
${isFirstSlide ? "This is the COVER slide — make it eye-catching and bold." : ""}
${isLastSlide ? "This is the CTA slide — make it action-oriented with clear call to action." : ""}
Title text on slide: "${title}"
${content ? `Body text: "${content}"` : ""}
${hasPhotos && style !== "Схемы & Инфографика" ? "Include a person in the slide that matches the uploaded reference photo." : ""}
Square format 1080x1080, professional social media post, high quality, text clearly readable, modern design.
Do NOT add any borders or watermarks.`;

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

    // Step 1: Generate slide content (text)
    const { slides: slideContents, caption } = await generateSlideContent(
      userText,
      funnel || "",
      style || "Классический тёплый"
    );

    console.log(`Generated ${slideContents.length} slide texts`);

    // Step 2: Generate images in parallel (batched to avoid rate limits)
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
        // Continue with other slides even if one fails
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
