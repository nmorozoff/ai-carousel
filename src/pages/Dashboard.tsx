import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Download, FileArchive, User, CalendarDays, Copy, Check, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";
import PhotoReference from "@/components/dashboard/PhotoReference";
import JSZip from "jszip";
import { toast } from "sonner";
import professionalSample1 from "@/assets/samples/professional-1.jpeg";
import professionalSample2 from "@/assets/samples/professional-2.jpeg";
import professionalSample3 from "@/assets/samples/professional-3.jpeg";
import professionalSample4 from "@/assets/samples/professional-4.jpeg";
import professionalSample5 from "@/assets/samples/professional-5.jpeg";
import professionalSample6 from "@/assets/samples/professional-6.jpeg";
import professionalSample7 from "@/assets/samples/professional-7.jpeg";
import infographicSample1 from "@/assets/samples/infographic-1.jpeg";
import infographicSample2 from "@/assets/samples/infographic-2.jpeg";
import infographicSample3 from "@/assets/samples/infographic-3.jpeg";
import infographicSample4 from "@/assets/samples/infographic-4.jpeg";
import infographicSample5 from "@/assets/samples/infographic-5.jpeg";
import infographicSample6 from "@/assets/samples/infographic-6.jpeg";
import infographicSample7 from "@/assets/samples/infographic-7.jpeg";
import lightEditorialSample1 from "@/assets/samples/light-editorial-1.jpeg";
import lightEditorialSample2 from "@/assets/samples/light-editorial-2.jpeg";
import lightEditorialSample3 from "@/assets/samples/light-editorial-3.jpeg";
import lightEditorialSample4 from "@/assets/samples/light-editorial-4.jpeg";
import lightEditorialSample5 from "@/assets/samples/light-editorial-5.jpeg";
import lightEditorialSample6 from "@/assets/samples/light-editorial-6.jpeg";
import lightEditorialSample7 from "@/assets/samples/light-editorial-7.jpeg";
import expertSample1 from "@/assets/samples/expert-infographic-1.jpeg";
import expertSample2 from "@/assets/samples/expert-infographic-2.jpeg";
import expertSample3 from "@/assets/samples/expert-infographic-3.jpeg";
import expertSample4 from "@/assets/samples/expert-infographic-4.jpeg";
import expertSample5 from "@/assets/samples/expert-infographic-5.jpeg";
import expertSample6 from "@/assets/samples/expert-infographic-6.jpeg";
import expertSample7 from "@/assets/samples/expert-infographic-7.jpeg";
import darkSample1 from "@/assets/samples/dark-1.jpeg";
import darkSample2 from "@/assets/samples/dark-2.jpeg";
import darkSample3 from "@/assets/samples/dark-3.jpeg";
import darkSample4 from "@/assets/samples/dark-4.jpeg";
import darkSample5 from "@/assets/samples/dark-5.jpeg";
import darkSample6 from "@/assets/samples/dark-6.jpeg";
import darkSample7 from "@/assets/samples/dark-7.jpeg";
import illustratedSample1 from "@/assets/samples/illustrated-1.jpeg";
import illustratedSample2 from "@/assets/samples/illustrated-2.jpeg";
import illustratedSample3 from "@/assets/samples/illustrated-3.jpeg";
import illustratedSample4 from "@/assets/samples/illustrated-4.jpeg";
import illustratedSample5 from "@/assets/samples/illustrated-5.jpeg";
import illustratedSample6 from "@/assets/samples/illustrated-6.jpeg";
import illustratedSample7 from "@/assets/samples/illustrated-7.jpeg";
import storytellingSample1 from "@/assets/samples/storytelling-1.jpeg";
import storytellingSample2 from "@/assets/samples/storytelling-2.jpeg";
import storytellingSample3 from "@/assets/samples/storytelling-3.jpeg";
import storytellingSample4 from "@/assets/samples/storytelling-4.jpeg";
import storytellingSample5 from "@/assets/samples/storytelling-5.jpeg";
import storytellingSample6 from "@/assets/samples/storytelling-6.jpeg";
import storytellingSample7 from "@/assets/samples/storytelling-7.jpeg";

const lightEditorialSamples = [lightEditorialSample1, lightEditorialSample2, lightEditorialSample3, lightEditorialSample4, lightEditorialSample5, lightEditorialSample6, lightEditorialSample7];
const infographicSamples = [infographicSample1, infographicSample2, infographicSample3, infographicSample4, infographicSample5, infographicSample6, infographicSample7];
const expertSamples = [expertSample1, expertSample2, expertSample3, expertSample4, expertSample5, expertSample6, expertSample7];
const darkSamples = [darkSample1, darkSample2, darkSample3, darkSample4, darkSample5, darkSample6, darkSample7];
const illustratedSamples = [illustratedSample1, illustratedSample2, illustratedSample3, illustratedSample4, illustratedSample5, illustratedSample6, illustratedSample7];
const storytellingSamples = [storytellingSample1, storytellingSample2, storytellingSample3, storytellingSample4, storytellingSample5, storytellingSample6, storytellingSample7];

const professionalSamples = [professionalSample1, professionalSample2, professionalSample3, professionalSample4, professionalSample5, professionalSample6, professionalSample7];

const carouselStyles = [
  { id: "professional", name: "Профессиональный", samples: professionalSamples, subtitle: null, noPhoto: false },
  { id: "light-editorial", name: "Светлый", samples: lightEditorialSamples, subtitle: null, noPhoto: false },
  { id: "expert-infographic", name: "Инфографика с экспертом", samples: expertSamples, subtitle: null, noPhoto: false },
  { id: "dark", name: "Тёмный", samples: darkSamples, subtitle: null, noPhoto: false },
  { id: "illustrated", name: "Персонаж", samples: illustratedSamples, subtitle: "Загрузи своё фото — на его основе создаётся твой 3D персонаж", noPhoto: false },
  { id: "infographic", name: "Схемы & Инфографика", samples: infographicSamples, subtitle: "Фото не требуется — стиль на основе схем и данных", noPhoto: true },
  { id: "storytelling", name: "Сторителлинг", samples: storytellingSamples, subtitle: "Фото не требуется — каждый слайд иллюстрирует сцену из истории", noPhoto: true },
];

const styleIdToName: Record<string, string> = {
  "professional": "Профессиональный",
  "light-editorial": "Светлый",
  "expert-infographic": "Инфографика с экспертом",
  "dark": "Тёмный",
  "illustrated": "Персонаж",
  "infographic": "Схемы & Инфографика",
  "storytelling": "Сторителлинг",
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
  const [funnelType, setFunnelType] = useState("");
  const [funnelKeyword, setFunnelKeyword] = useState("");
  const [funnelBenefit, setFunnelBenefit] = useState("");
  const [funnelHighlight, setFunnelHighlight] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("professional");
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<SlideResult[] | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [captionCopied, setCaptionCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"slides" | "caption">("slides");
  const [userPhotos, setUserPhotos] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  const selectedStyleData = carouselStyles.find(s => s.id === selectedStyle);
  const showPhotoBlock = !selectedStyleData?.noPhoto;

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

  const buildFunnelText = (): string => {
    switch (funnelType) {
      case "keyword":
        return `Напиши в комментарии кодовое слово ${funnelKeyword || "СЛОВО"} и я пришлю тебе ${funnelBenefit || "полезный материал"}`;
      case "highlight":
        return `Все подробности в актуальном ${funnelHighlight || "хайлайте"} — ссылка в шапке профиля`;
      case "subscribe":
        return "Подпишись чтобы не пропустить следующий пост";
      case "save":
        return "Сохрани чтобы не потерять";
      case "question":
        return "Задай один цепляющий вопрос к аудитории по теме поста";
      default:
        return "";
    }
  };

  const handleGenerate = async () => {
    if (!text.trim() || !funnelType) return;
    setIsGenerating(true);
    setResults(null);
    setCaption(null);

    try {
      const photosRaw = userPhotos.map((p) => {
        const match = p.match(/^data:[^;]+;base64,(.+)$/);
        return match ? match[1] : p;
      });

      const funnelText = buildFunnelText();

      const { data, error } = await supabase.functions.invoke("generate-slides", {
        body: {
          userText: text,
          funnel: funnelText,
          style: styleIdToName[selectedStyle] || "Профессиональный",
          userPhotos: photosRaw,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Ошибка генерации");

      setResults(data.slides);
      setCaption(data.caption || null);
      setActiveTab("slides");
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
    <div className="min-h-screen py-4 sm:py-8 px-3 sm:px-4">
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

        {/* Призыв в описании поста */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass rounded-2xl p-6 mb-4"
        >
          <h2 className="font-heading font-semibold text-lg mb-3">Призыв в описании поста</h2>
          <Select value={funnelType} onValueChange={(v) => setFunnelType(v)}>
            <SelectTrigger className="bg-background border-2 border-border rounded-xl">
              <SelectValue placeholder="Выберите тип призыва" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keyword">Кодовое слово</SelectItem>
              <SelectItem value="highlight">Перейти в хайлайт</SelectItem>
              <SelectItem value="subscribe">Подписаться</SelectItem>
              <SelectItem value="save">Сохранить</SelectItem>
              <SelectItem value="question">Вопрос аудитории</SelectItem>
            </SelectContent>
          </Select>

          {funnelType === "keyword" && (
            <div className="mt-3 space-y-3">
              <Input
                value={funnelKeyword}
                onChange={(e) => setFunnelKeyword(e.target.value)}
                placeholder="Кодовое слово (например: РАЗБОР)"
                className="bg-background border-2 border-border rounded-xl"
              />
              <Input
                value={funnelBenefit}
                onChange={(e) => setFunnelBenefit(e.target.value)}
                placeholder="Что получит человек (например: личный план)"
                className="bg-background border-2 border-border rounded-xl"
              />
            </div>
          )}

          {funnelType === "highlight" && (
            <div className="mt-3">
              <Input
                value={funnelHighlight}
                onChange={(e) => setFunnelHighlight(e.target.value)}
                placeholder="Название хайлайта"
                className="bg-background border-2 border-border rounded-xl"
              />
            </div>
          )}
        </motion.div>

        {/* Фото-референс — только для стилей, где нужно фото */}
        <AnimatePresence>
          {showPhotoBlock && (
            <PhotoReference
              photos={userPhotos}
              onChange={setUserPhotos}
              subtitle={
                selectedStyle === "expert-infographic"
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
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    selectedStyle === style.id ? "border-primary" : "border-muted-foreground/40"
                  }`}>
                    {selectedStyle === style.id && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <span className="font-heading font-medium text-sm">{style.name}</span>
                </div>
                {style.subtitle && (
                  <p className="text-xs text-muted-foreground ml-7 mb-2">{style.subtitle}</p>
                )}
                <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 ml-7" style={{ paddingTop: "8px" }}>
                  {Array.from({ length: 7 }, (_, i) => (
                    <div
                      key={i}
                      className="w-12 h-15 sm:w-16 sm:h-20 rounded-lg border border-border/60 bg-secondary/40 shrink-0 overflow-hidden"
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
            disabled={!text.trim() || !funnelType || isGenerating}
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
                <p className="font-heading font-semibold text-lg">Генерируем и очищаем слайды...</p>
                <p className="text-sm text-muted-foreground mt-1">Это займёт 1-2 минуты ☕</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {(results && results.length > 0) || caption ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-6"
            >
              {/* Tabs */}
              <div className="flex gap-1 mb-6 bg-muted/50 rounded-xl p-1">
                <button
                  onClick={() => setActiveTab("slides")}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                    activeTab === "slides"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Слайды {results ? `(${results.length})` : ""}
                </button>
                <button
                  onClick={() => setActiveTab("caption")}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                    activeTab === "caption"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  📝 Описание поста
                </button>
              </div>

              {/* Slides tab */}
              {activeTab === "slides" && results && results.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-heading font-semibold text-base">Результат: {results.length} слайдов</h2>
                    <Button variant="outline" size="sm" className="gap-2" onClick={downloadAllZip}>
                      <FileArchive className="w-4 h-4" />
                      Скачать ZIP
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
                </div>
              )}

              {/* Caption tab */}
              {activeTab === "caption" && (
                <div>
                  {caption ? (
                    <>
                      <div className="bg-background border border-border rounded-xl p-4 mb-4 whitespace-pre-line text-sm leading-relaxed min-h-[160px]">
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
                    </>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      Описание появится после генерации слайдов
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Dashboard;
