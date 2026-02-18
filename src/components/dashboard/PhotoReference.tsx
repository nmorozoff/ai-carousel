import { useState, useRef, useCallback } from "react";
import { Camera, X } from "lucide-react";
import { motion } from "framer-motion";

interface PhotoReferenceProps {
  photos: string[];
  onChange: (photos: string[]) => void;
  subtitle?: string;
}

const MAX_PHOTOS = 3;
const ACCEPTED_TYPES = ["image/jpeg", "image/png"];

const PhotoReference = ({ photos, onChange, subtitle }: PhotoReferenceProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(
    (files: FileList | File[]) => {
      const remaining = MAX_PHOTOS - photos.length;
      if (remaining <= 0) return;

      const valid = Array.from(files)
        .filter((f) => ACCEPTED_TYPES.includes(f.type))
        .slice(0, remaining);

      valid.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = e.target?.result as string;
          onChange([...photos, base64].slice(0, MAX_PHOTOS));
        };
        reader.readAsDataURL(file);
      });
    },
    [photos, onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const handleRemove = (index: number) => {
    onChange(photos.filter((_, i) => i !== index));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ delay: 0.07 }}
      className="glass rounded-2xl p-6 mb-4"
    >
      <h2 className="font-heading font-semibold text-lg mb-1">
        Фото-референс <span className="text-muted-foreground font-normal text-sm">(необязательно)</span>
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        {subtitle || "Загрузите 1-3 фото себя — ИИ вставит вас в слайды"}
      </p>

      {photos.length < MAX_PHOTOS && (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/50"
          }`}
        >
          <Camera className="w-8 h-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground text-center">
            Перетащите фото или нажмите для выбора
          </span>
          <span className="text-xs text-muted-foreground/60">JPG, PNG · макс. 3 файла</span>
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) processFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {photos.length > 0 && (
        <div className="flex gap-3 mt-4 flex-wrap">
          {photos.map((src, i) => (
            <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border group">
              <img src={src} alt={`Референс ${i + 1}`} className="w-full h-full object-cover" />
              <button
                onClick={() => handleRemove(i)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-background/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default PhotoReference;
