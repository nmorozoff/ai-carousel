import { generateCarousel } from "@/integrations/fireworks/client";

export async function generateCarouselAndDownload(
  text: string,
  photoReferences: string[],
  styleId: string,
  userId: string
): Promise<{ carouselZip: Uint8Array; description: string }> {
  try {
    const { carouselZip, description } = await generateCarousel(
      text,
      photoReferences,
      styleId,
      userId
    );

    return { carouselZip, description };
  } catch (e: any) {
    console.error("Error generating carousel:", e);
    throw new Error(e.message || "Failed to generate carousel");
  }
}
