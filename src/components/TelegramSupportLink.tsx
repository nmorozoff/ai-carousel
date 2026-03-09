import { cn } from "@/lib/utils";

const TELEGRAM_URL = "https://t.me/carousel_support";

/** Иконка Telegram (paper plane) */
const TelegramIcon = ({ className, size = 20 }: { className?: string; size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={cn("shrink-0", className)}
    fill="currentColor"
  >
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

type Variant = "default" | "button" | "minimal";

interface TelegramSupportLinkProps {
  variant?: Variant;
  className?: string;
  showLabel?: boolean;
  label?: string;
  iconSize?: number;
  onClick?: () => void;
}

/** Ссылка на техподдержку в Telegram */
const TelegramSupportLink = ({
  variant = "default",
  className,
  showLabel = true,
  label = "Поддержка в Telegram",
  iconSize = 20,
  onClick,
}: TelegramSupportLinkProps) => {
  const base = "inline-flex items-center gap-2 transition-colors hover:opacity-90";

  const variants: Record<Variant, string> = {
    default:
      "text-[#0088cc] dark:text-[#54a9eb] font-medium",
    button:
      "bg-[#0088cc] dark:bg-[#0088cc] text-white rounded-xl px-5 py-2.5 text-sm font-medium",
    minimal:
      "text-muted-foreground hover:text-foreground text-sm",
  };

  return (
    <a
      href={TELEGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(base, variants[variant], className)}
      title="@carousel_support"
      onClick={onClick}
    >
      <TelegramIcon size={iconSize} />
      {showLabel && <span>{label}</span>}
    </a>
  );
};

export { TelegramSupportLink, TelegramIcon, TELEGRAM_URL };
