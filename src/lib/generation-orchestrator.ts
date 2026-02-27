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
    const batchNum = Math.floor(i / batchSize) + 1;
    callbacks.onStatus(`Генерация изображений: батч ${batchNum}/${Math.ceil(items.length / batchSize)}...`);

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
          callbacks.onSlideReady(item.slideNumber);
          return {
            slideNumber: item.slideNumber,
            title: item.title,
            content: item.content,
            imageBase64: data.imageBase64,
            mimeType: data.mimeType,
          };
        } catch (err: any) {
          console.error(`Slide ${item.slideNumber} image error:`, err);
          return {
            slideNumber: item.slideNumber,
            title: item.title,
            content: item.content,
            imageBase64: "",
            mimeType: "image/png",
          };
        }
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
  callbacks: GenerationCallbacks
): Promise<{ slides: SlideResult[]; caption: string }> {
  const startTime = Date.now();

  // Step 1: Generate texts, caption, SEO
  callbacks.onStatus("Генерация текстов и описания...");
  const textData = await callEdgeFunction(token, {
    mode: "text",
    userText,
    funnel,
    style,
  });

  if (!textData.success) throw new Error(textData.error || "Text generation failed");

  const slideTexts: SlideText[] = textData.slides;
  const caption: string = textData.caption || "";
  const seoMeta = textData.seoMeta || { title: "", keywords: "" };
  const autoStyleEnhancement: string = textData.autoStyleEnhancement || "";

  // Step 2: Generate images in batches of 3
  const isStorytelling = style === "Сторителлинг";
  let allSlides: SlideResult[];

  if (isStorytelling) {
    // Storytelling: slide 1 first, extract character, then 2-7 in batches
    callbacks.onStatus("Сторителлинг: генерация слайда 1...");
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

    let characterDescription = "";
    if (slide1Data.success && slide1Data.imageBase64) {
      callbacks.onStatus("Извлечение описания персонажа...");
      const charData = await callEdgeFunction(token, {
        mode: "describe-character",
        imageBase64: slide1Data.imageBase64,
        mimeType: slide1Data.mimeType,
      });
      characterDescription = charData.description || "";
    }

    // Generate slides 2-7 in batches of 3
    const remainingItems = slideTexts.slice(1).map((s, i) => ({
      slideNumber: i + 2,
      title: s.title,
      content: s.content,
    }));

    const remainingSlides = await generateInBatches(
      remainingItems, 3, token, style, userPhotos, characterDescription, callbacks, autoStyleEnhancement
    );

    allSlides = [
      {
        slideNumber: 1,
        title: slideTexts[0].title,
        content: slideTexts[0].content,
        imageBase64: slide1Data.imageBase64 || "",
        mimeType: slide1Data.mimeType || "image/png",
      },
      ...remainingSlides,
    ];
  } else {
    // All other styles: batches of 3
    const items = slideTexts.map((s, i) => ({
      slideNumber: i + 1,
      title: s.title,
      content: s.content,
    }));

    allSlides = await generateInBatches(
      items, 3, token, style, userPhotos, undefined, callbacks, autoStyleEnhancement
    );
  }

  // Step 3: Clean images in batches of 3
  callbacks.onStatus("Очистка метаданных изображений...");
  const cleanedSlides = await cleanInBatches(allSlides, 3, token, seoMeta, callbacks);

  const durationMs = Date.now() - startTime;

  // Step 4: Log generation (fire and forget)
  const slidesForLog = cleanedSlides.map(({ imageBase64: _, ...rest }) => rest);
  callEdgeFunction(token, {
    mode: "log",
    style,
    funnel,
    userText,
    slideCount: cleanedSlides.length,
    caption,
    durationMs,
    slidesJson: slidesForLog,
    error: cleanedSlides.filter(s => !s.imageBase64).length > 0
      ? `${cleanedSlides.filter(s => !s.imageBase64).length} slides failed`
      : null,
  }).catch((e) => console.error("Log error:", e));

  return { slides: cleanedSlides, caption };
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
          return {
            ...slide,
            imageBase64: data.imageBase64 || slide.imageBase64,
            mimeType: data.mimeType || slide.mimeType,
          };
        } catch {
          return slide;
        }
      })
    );

    results.push(...batchResults);
  }

  return results;
}
