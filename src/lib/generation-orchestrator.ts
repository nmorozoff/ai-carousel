// Orchestrates slide generation by calling the edge function in modes:
// 1. "text" → get slide texts, caption, SEO
// 2. "image" → generate ONE slide image (called in batches of 3)
// 3. "describe-character" → extract character description (storytelling only)
// 4. "clean" → clean ONE slide image (called in batches of 3)
// 5. "log" → save generation log

interface SlideText {
  title: string;
  content: string;
}

interface SlideResult {
  slideNumber: number;
  title: string;
  content: string;
  imageBase64: string;
  mimeType: string;
  slideUrl?: string;
}

interface GenerationCallbacks {
  onStatus: (status: string) => void;
  onSlideReady: (slideNumber: number) => void;
}

async function callEdgeFunction(token: string, body: Record<string, any>): Promise<any> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/generate-slides`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": anonKey,
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `HTTP ${response.status}`);
  }

  return response.json();
}

async function generateInBatches(
  items: { slideNumber: number; title: string; content: string }[],
  batchSize: number,
  token: string,
  style: string,
  userPhotos: string[],
  characterDescription: string | undefined,
  callbacks: GenerationCallbacks,
  autoStyleEnhancement?: string
): Promise<{ slideNumber: number; title: string; content: string; imageBase64: string; mimeType: string }[]> {
  const results: any[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    callbacks.onStatus(`✨ Создаём изображение ${i + 1} из ${items.length}...`);

    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          const data = await callEdgeFunction(token, {
            mode: "image",
            slideNumber: item.slideNumber,
            title: item.title,
            content: item.content,
            style,
            userPhotos,
            characterDescription,
            autoStyleEnhancement,
          });
          if (data.imageBase64) {
            callbacks.onSlideReady(item.slideNumber);
            return {
              slideNumber: item.slideNumber,
              title: item.title,
              content: item.content,
              imageBase64: data.imageBase64,
              mimeType: data.mimeType,
              slideUrl: data.slideUrl || "",
            };
          }
          console.warn(`Slide ${item.slideNumber} returned empty image`);
        } catch (err: any) {
          console.error(`Slide ${item.slideNumber} image error:`, err);
        }
        return {
          slideNumber: item.slideNumber,
          title: item.title,
          content: item.content,
          imageBase64: "",
          mimeType: "image/png",
          slideUrl: "",
        };
      })
    );

    results.push(...batchResults);
  }

  return results;
}

export async function orchestrateGeneration(
  token: string,
  userText: string,
  funnel: string,
  style: string,
  userPhotos: string[],
  callbacks: GenerationCallbacks,
  isReadyMode: boolean = false
): Promise<{ slides: SlideResult[]; caption: string; characterDescription?: string; autoStyleEnhancement?: string; seoMeta?: { title: string; keywords: string } }> {
  const startTime = Date.now();

  callbacks.onStatus(isReadyMode ? "Обработка готовой карусели..." : "Генерация текстов и описания...");
  const textPayload = isReadyMode
    ? { mode: "text", mode_ready: true, rawText: userText, style }
    : { mode: "text", userText, funnel, style };
  const textData = await callEdgeFunction(token, textPayload);

  if (!textData.success) throw new Error(textData.error || "Text generation failed");

  const slideTexts: SlideText[] = textData.slides;
  const caption: string = textData.caption || "";
  const seoMeta = textData.seoMeta || { title: "", keywords: "" };
  const autoStyleEnhancement: string = textData.autoStyleEnhancement || "";
  let characterDescription = "";

  const isStorytelling = style === "Сторителлинг";
  const isPersonazh = style === "Персонаж";
  let allSlides: SlideResult[];

  if (isStorytelling || isPersonazh) {
    callbacks.onStatus(isStorytelling ? "Сторителлинг: генерация слайда 1..." : "Персонаж: генерация слайда 1...");
    const slide1Data = await callEdgeFunction(token, {
      mode: "image",
      slideNumber: 1,
      title: slideTexts[0].title,
      content: slideTexts[0].content,
      style,
      userPhotos,
      autoStyleEnhancement,
    });
    callbacks.onSlideReady(1);

    if (slide1Data.success && slide1Data.imageBase64) {
      callbacks.onStatus("Извлечение описания персонажа...");
      const charData = await callEdgeFunction(token, {
        mode: "describe-character",
        imageBase64: slide1Data.imageBase64,
        mimeType: slide1Data.mimeType,
      });
      characterDescription = charData.description || "";
    }

    const batchSize = isStorytelling ? 3 : 1;
    const remainingItems = slideTexts.slice(1).map((s, i) => ({
      slideNumber: i + 2,
      title: s.title,
      content: s.content,
    }));

    const remainingSlides = await generateInBatches(
      remainingItems, batchSize, token, style, userPhotos, characterDescription, callbacks, autoStyleEnhancement
    );

    allSlides = [
      {
        slideNumber: 1,
        title: slideTexts[0].title,
        content: slideTexts[0].content,
        imageBase64: slide1Data.imageBase64 || "",
        mimeType: slide1Data.mimeType || "image/png",
        slideUrl: slide1Data.slideUrl || "",
      },
      ...remainingSlides,
    ];
  } else {
    const items = slideTexts.map((s, i) => ({
      slideNumber: i + 1,
      title: s.title,
      content: s.content,
    }));

    allSlides = await generateInBatches(
      items, 1, token, style, userPhotos, undefined, callbacks, autoStyleEnhancement
    );
  }

  callbacks.onStatus("🎨 Финальная обработка изображений...");
  const cleanedSlides = await cleanInBatches(allSlides, 3, token, seoMeta, callbacks);

  const durationMs = Date.now() - startTime;

  const slidesForLog = cleanedSlides.map(({ imageBase64: _, ...rest }) => rest);
  const slideUrls = cleanedSlides.map(s => s.slideUrl || "").filter(Boolean);
  callEdgeFunction(token, {
    mode: "log",
    style,
    funnel,
    userText,
    slideCount: cleanedSlides.length,
    caption,
    durationMs,
    slidesJson: slidesForLog,
    slideUrls,
    error: cleanedSlides.filter(s => !s.imageBase64).length > 0
      ? `${cleanedSlides.filter(s => !s.imageBase64).length} slides failed`
      : null,
  }).catch((e) => console.error("Log error:", e));

  return {
    slides: cleanedSlides,
    caption,
    characterDescription,
    autoStyleEnhancement,
    seoMeta,
  };
}

export interface RegenerateSlidesOptions {
  overrides?: Map<number, { title?: string; content?: string }>;
  characterDescription?: string;
  autoStyleEnhancement?: string;
  seoMeta?: { title: string; keywords: string };
}

export async function regenerateSlides(
  token: string,
  slides: SlideResult[],
  slideNumbers: number[],
  style: string,
  userPhotos: string[],
  options: RegenerateSlidesOptions,
  callbacks: GenerationCallbacks
): Promise<SlideResult[]> {
  if (slideNumbers.length === 0) return slides;

  const { overrides, characterDescription, autoStyleEnhancement, seoMeta = { title: "", keywords: "" } } = options;

  callbacks.onStatus(`Перегенерация слайда ${slideNumbers.join(", ")}...`);

  const items = slideNumbers.map((num) => {
    const slide = slides.find((s) => s.slideNumber === num);
    const ov = overrides?.get(num);
    return {
      slideNumber: num,
      title: ov?.title ?? slide?.title ?? "",
      content: ov?.content ?? slide?.content ?? "",
    };
  });

  const regenerated = await generateInBatches(
    items, 3, token, style, userPhotos, characterDescription, callbacks, autoStyleEnhancement
  );

  const cleaned = await cleanInBatches(regenerated, 3, token, seoMeta, callbacks);
  const regenMap = new Map(cleaned.map((s) => [s.slideNumber, s]));

  return slides.map((s) => {
    if (regenMap.has(s.slideNumber)) {
      const regen = regenMap.get(s.slideNumber)!;
      return { ...s, title: regen.title, content: regen.content, imageBase64: regen.imageBase64, mimeType: regen.mimeType, slideUrl: regen.slideUrl ?? s.slideUrl };
    }
    return s;
  });
}

export async function regenerateMissingSlides(
  token: string,
  slides: SlideResult[],
  style: string,
  userPhotos: string[],
  callbacks: GenerationCallbacks,
  options?: { characterDescription?: string; autoStyleEnhancement?: string; seoMeta?: { title: string; keywords: string } }
): Promise<SlideResult[]> {
  const missing = slides.filter(s => !s.imageBase64);
  if (missing.length === 0) return slides;

  callbacks.onStatus(`Повторная генерация ${missing.length} слайдов...`);

  const items = missing.map(s => ({ slideNumber: s.slideNumber, title: s.title, content: s.content }));
  const seoMeta = options?.seoMeta ?? { title: "", keywords: "" };
  const regenerated = await generateInBatches(
    items, 3, token, style, userPhotos, options?.characterDescription, callbacks, options?.autoStyleEnhancement
  );
  const cleaned = await cleanInBatches(regenerated, 3, token, seoMeta, callbacks);

  const regenMap = new Map(cleaned.map(s => [s.slideNumber, s]));
  return slides.map(s => {
    if (!s.imageBase64 && regenMap.has(s.slideNumber)) {
      const regen = regenMap.get(s.slideNumber)!;
      if (regen.imageBase64) return regen;
    }
    return s;
  });
}

async function cleanInBatches(
  slides: SlideResult[],
  batchSize: number,
  token: string,
  seoMeta: { title: string; keywords: string },
  callbacks: GenerationCallbacks
): Promise<SlideResult[]> {
  const results: SlideResult[] = [];

  for (let i = 0; i < slides.length; i += batchSize) {
    const batch = slides.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (slide) => {
        if (!slide.imageBase64) return slide;
        try {
          const data = await callEdgeFunction(token, {
            mode: "clean",
            imageBase64: slide.imageBase64,
            mimeType: slide.mimeType,
            title: seoMeta.title,
            keywords: seoMeta.keywords,
          });
          return { ...slide, imageBase64: data.imageBase64 || slide.imageBase64, mimeType: data.mimeType || slide.mimeType };
        } catch {
          return slide;
        }
      })
    );

    results.push(...batchResults);
  }

  return results;
}
