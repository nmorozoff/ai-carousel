import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, X, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import JSZip from "jszip";
import { toast } from "sonner";

interface CarouselSession {
  id: string;
  style: string | null;
  slide_urls: string[] | null;
  caption: string | null;
  created_at: string | null;
  expires_at: string | null;
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const months = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month}, ${hours}:${minutes}`;
};

const CarouselArchive = () => {
  const [sessions, setSessions] = useState<CarouselSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from("carousel_sessions")
        .select("*")
        .eq("user_id", session.user.id)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (!error && data) {
        setSessions(data as CarouselSession[]);
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleDownloadZip = async (session: CarouselSession) => {
    if (!session.slide_urls || session.slide_urls.length === 0) return;
    setDownloadingId(session.id);
    try {
      const zip = new JSZip();
      await Promise.all(
        session.slide_urls.map(async (url, i) => {
          try {
            const res = await fetch(url);
            const blob = await res.blob();
            zip.file(`slide_${i + 1}.png`, blob);
          } catch {
            console.warn(`Failed to fetch slide ${i + 1}`);
          }
        })
      );

      const blob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "carousel.zip";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      toast.error("Ошибка при скачивании");
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        Загрузка...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        Здесь будут ваши карусели
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {sessions.map((session) => (
          <Card
            key={session.id}
            className="cursor-pointer hover:border-primary/50 transition-colors overflow-hidden"
            onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
          >
            <CardContent className="p-0">
              {session.slide_urls && session.slide_urls[0] && (
                <img
                  src={session.slide_urls[0]}
                  alt="Превью"
                  className="w-full aspect-[4/5] object-cover"
                />
              )}
              <div className="p-3 space-y-1.5">
                <p className="text-xs text-muted-foreground">{formatDate(session.created_at)}</p>
                {session.style && (
                  <p className="text-xs font-medium truncate">{session.style}</p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 text-xs"
                  disabled={downloadingId === session.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadZip(session);
                  }}
                >
                  <Download className="w-3 h-3" />
                  {downloadingId === session.id ? "Скачивание..." : "Скачать ZIP"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Expanded preview modal */}
      <AnimatePresence>
        {expandedId && (() => {
          const session = sessions.find(s => s.id === expandedId);
          if (!session?.slide_urls) return null;
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setExpandedId(null)}
            >
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="bg-card border border-border rounded-2xl p-4 max-w-3xl w-full max-h-[80vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">{formatDate(session.created_at)} — {session.style}</p>
                  <Button variant="ghost" size="icon" onClick={() => setExpandedId(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {session.slide_urls.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Слайд ${i + 1}`}
                      className="h-64 sm:h-80 rounded-lg border border-border/30 shrink-0 object-cover"
                    />
                  ))}
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};

export default CarouselArchive;
