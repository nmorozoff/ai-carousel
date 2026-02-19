import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Download, FileArchive, User, CalendarDays, Copy, Check, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";
import PhotoReference from "@/components/dashboard/PhotoReference";
import JSZip from "jszip";
import { toast } from "sonner";
import expertSample1 from "@/assets/samples/expert-infographic-1.jpeg";
import expertSample2 from "@/assets/samples/expert-infographic-2.jpeg";
import expertSample3 from "@/assets/samples/expert-infographic-3.jpeg";
import expertSample4 from "@/assets/samples/expert-infographic-4.jpeg";
import expertSample5 from "@/assets/samples/expert-infographic-5.jpeg";
import expertSample6 from "@/assets/samples/expert-infographic-6.jpeg";
import expertSample7 from "@/assets/samples/expert-infographic-7.jpeg";

const expertSamples = [expertSample1, expertSample2, expertSample3, expertSample4, expertSample5, expertSample6, expertSample7];

const carouselStyles = [
  { id: "classic-warm", name: "Классический тёплый", samples: [] as string[] },
  { id: "light-editorial", name: "Светлый Editorial", samples: [] as string[] },
  { id: "expert-infographic", name: "Инфографика с экспертом", samples: expertSamples },
  { id: "dark", name: "Тёмный", samples: [] as string[] },
  { id: "illustrated", name: "Иллюстрированный персонаж", samples: [] as string[] },
  { id: "infographic", name: "Схемы & Инфографика", samples: [] as string[] },
];

const styleIdToName: Record<string, string> = {
  "classic-warm": "Классический тёплый",
  "light-editorial": "Светлый Editorial",
  "expert-infographic": "Инфографика с экспертом",
  "dark": "Тёмный",
  "illustrated": "Иллюстрированный персонаж",
  "infographic": "Схемы & Инфографика",
};

interface SlideResult {
  slideNumber: number;
  title: string;
  content: string;
  imageBase64: string;
  mimeType: string;
}

const Dashboard = () => {
  const [text, setText] = useState("");
  const [cta, setCta] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("classic-warm");
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<SlideResult[] | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [captionCopied, setCaptionCopied] = useState(false);
  const [userPhotos, setUserPhotos] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setEmail(session.user.email || "");

      const { data } = await supabase
        .from("subscriptions")
        .select("expires_at")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .maybeSingle();

      if (data?.expires_at) {
        const diff = Math.ceil((new Date(data.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        setDaysLeft(Math.max(0, diff));
      }
    };
    load();
  }, []);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setIsGenerating(true);
    setResults(null);
    setCaption(null);

    try {
      const photosRaw = userPhotos.map((p) => {
        const match = p.match(/^data:[^;]+;base64,(.+)$/);
        return match ? match[1] : p;
      });

      const { data, error } = await supabase.functions.invoke("generate-slides", {
        body: {
          userText: text,
          funnel: cta,
          style: styleIdToName[selectedStyle] || "Классический тёплый",
          userPhotos: photosRaw,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Ошибка генерации");

      setResults(data.slides);
      setCaption(data.caption || null);
      toast.success("Слайды успешно сгенерированы!");

      // Log generation event
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.from("activity_log").insert({
          user_id: session.user.id,
          action: "generate_slides",
          details: { style: styleIdToName[selectedStyle], slides_count: data.slides?.length || 0 },
        });
      }
    } catch (err: any) {
      console.error("Generation error:", err);
      toast.error(err.message || "Произошла ошибка при генерации");
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadSlide = (slide: SlideResult) => {
    const ext = slide.mimeType?.includes("png") ? "png" : "jpg";
    const link = document.createElement("a");
    link.href = `data:${slide.mimeType};base64,${slide.imageBase64}`;
    link.download = `slide-${slide.slideNumber}.${ext}`;
    link.click();
  };

  const downloadAllZip = async () => {
    if (!results) return;
    const zip = new JSZip();
    results.forEach((slide) => {
      const ext = slide.mimeType?.includes("png") ? "png" : "jpg";
      zip.file(`slide-${slide.slideNumber}.${ext}`, slide.imageBase64, { base64: true });
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "carousel.zip";
    link.click();
    URL.revokeObjectURL(link.href);

    // Log download event
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("activity_log").insert({
        user_id: session.user.id,
        action: "download_zip",
        details: { slides_count: results?.length || 0 },
      });
    }
  };

  const copyCaption = async () => {
    if (!caption) return;
    await navigator.clipboard.writeText(caption);
    setCaptionCopied(true);
    setTimeout(() => setCaptionCopied(false), 2000);
  };

  const downloadCaption = () => {
    if (!caption) return;
    const blob = new Blob([caption], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "описание_карусели.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="container mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">На главную</span>
          </Link>
          <h1 className="text-xl font-heading font-bold text-gradient">CAROUSEL AI</h1>
          <ThemeToggle />
        </div>

        {/* Account Info */}
        <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <User className="w-4 h-4" />
            <span>{email}</span>
          </div>
          {daysLeft !== null && (
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4" />
              <span>Подписка: {daysLeft} {daysLeft === 1 ? "день" : daysLeft < 5 ? "дня" : "дней"}</span>
            </div>
          )}
        </div>

        {/* Текст для карусели */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-6 mb-4"
        >
          <h2 className="font-heading font-semibold text-lg mb-3">Текст для Карусели</h2>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Вставьте текст поста, тезисы, мысли, транскрибацию рилса, видео или эфира"
            className="min-h-[140px] bg-background border-2 border-border rounded-xl resize-none text-sm placeholder:text-muted-foreground/70"
          />
        </motion.div>

        {/* Воронка в карусели */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass rounded-2xl p-6 mb-4"
        >
          <h2 className="font-heading font-semibold text-lg mb-3">Воронка в карусели</h2>
          <Textarea
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            placeholder={'Введите призыв к действию для последнего слайда.\n\nПримеры:\n• Кодовое слово: "РАЗБОР" → ИИ напишет:\n  "Напиши РАЗБОР в комментарии — пришлю личный план"\n• Директ: "Напиши мне ХОЧУ в Директ"\n• Подписка: "Подпишись чтобы не потерять"\n\nЕсли оставить поле пустым — ИИ подберёт призыв автоматически по теме карусели'}
            className="min-h-[100px] bg-background border-2 border-border rounded-xl resize-none text-sm placeholder:text-muted-foreground/70"
          />
        </motion.div>

        {/* Фото-референс */}
        <AnimatePresence>
          {selectedStyle !== "infographic" && (
            <PhotoReference
              photos={userPhotos}
              onChange={setUserPhotos}
              subtitle={
                selectedStyle === "illustrated"
                  ? "Загрузите фото — ИИ создаст 3D-персонаж похожий на вас"
                  : selectedStyle === "expert-infographic"
                  ? "Загрузите фото — эксперт появится в сцене с реквизитом"
                  : "Загрузите 1-3 фото себя — ИИ вставит вас в слайды"
              }
            />
          )}
        </AnimatePresence>

        {/* Стиль карусели */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-6 mb-4"
        >
          <h2 className="font-heading font-semibold text-lg mb-4">Стиль карусели</h2>
          <div className="space-y-4">
            {carouselStyles.map((style) => (
              <button
                key={style.id}
                onClick={() => setSelectedStyle(style.id)}
                className={`w-full text-left rounded-xl border p-4 transition-all ${
                  selectedStyle === style.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border/50 hover:border-border"
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    selectedStyle === style.id ? "border-primary" : "border-muted-foreground/40"
                  }`}>
                    {selectedStyle === style.id && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <span className="font-heading font-medium text-sm">{style.name}</span>
                </div>
                {style.id === "infographic" && (
                  <p className="text-xs text-muted-foreground ml-7 -mt-1 mb-1">Фото не требуется — стиль на основе схем и данных</p>
                )}
                <div className="flex gap-2 overflow-x-auto pb-1 ml-7">
                  {Array.from({ length: 7 }, (_, i) => (
                    <div
                      key={i}
                      className="w-16 h-20 rounded-lg border border-border/60 bg-secondary/40 shrink-0 overflow-hidden"
                    >
                      {style.samples[i] && (
                        <img
                          src={style.samples[i]}
                          alt={`Образец ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Кнопка генерации */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Button
            onClick={handleGenerate}
            disabled={!text.trim() || isGenerating}
            className="w-full bg-gradient-primary text-primary-foreground border-0 hover:opacity-90 transition-opacity h-12 text-base mb-6"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Генерация...
              </>
            ) : (
              "Генерировать слайды карусели"
            )}
          </Button>
        </motion.div>

        {/* Loading state */}
        <AnimatePresence>
          {isGenerating && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="glass rounded-2xl p-8 mb-6 flex flex-col items-center justify-center gap-4"
            >
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-heading font-semibold text-lg">Генерируем ваши слайды...</p>
                <p className="text-sm text-muted-foreground mt-1">Это займёт 1-2 минуты ☕</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {results && results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-heading font-semibold text-lg">Результат: {results.length} слайдов</h2>
                <Button variant="outline" size="sm" className="gap-2" onClick={downloadAllZip}>
                  <FileArchive className="w-4 h-4" />
                  Скачать ZIP
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {results.map((slide) => (
                  <div key={slide.slideNumber} className="relative group rounded-xl overflow-hidden border border-border/30">
                    <img
                      src={`data:${slide.mimeType};base64,${slide.imageBase64}`}
                      alt={`Слайд ${slide.slideNumber}`}
                      className="w-full aspect-[4/5] object-cover"
                    />
                    <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button size="sm" variant="secondary" className="gap-2" onClick={() => downloadSlide(slide)}>
                        <Download className="w-4 h-4" />
                        Скачать
                      </Button>
                    </div>
                    <div className="absolute top-2 left-2">
                      <span className="text-xs font-heading font-bold bg-background/70 rounded-md px-2 py-1">
                        {slide.slideNumber}/7
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Описание к посту */}
        <AnimatePresence>
          {caption && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-6 mt-6"
            >
              <h2 className="font-heading font-semibold text-lg mb-4">📝 Описание к посту</h2>
              <div className="bg-background border border-border rounded-xl p-4 mb-4 whitespace-pre-line text-sm leading-relaxed">
                {caption}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="outline" className="gap-2 flex-1" onClick={copyCaption}>
                  {captionCopied ? (
                    <><Check className="w-4 h-4" />Скопировано!</>
                  ) : (
                    <><Copy className="w-4 h-4" />Скопировать текст</>
                  )}
                </Button>
                <Button variant="outline" className="gap-2 flex-1" onClick={downloadCaption}>
                  <FileText className="w-4 h-4" />
                  Скачать .txt
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Dashboard;
