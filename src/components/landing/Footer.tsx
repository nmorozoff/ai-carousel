import { TelegramSupportLink } from "@/components/TelegramSupportLink";

const Footer = () => (
  <footer className="py-8 border-t border-border">
    <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-sm text-muted-foreground">
      <span>© {new Date().getFullYear()} Carousel AI. Все права защищены.</span>
      <TelegramSupportLink variant="minimal" label="Поддержка в Telegram" />
    </div>
  </footer>
);

export default Footer;
