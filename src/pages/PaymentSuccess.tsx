import { useSearchParams, Link } from "react-router-dom";
import { MessageCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TelegramSupportLink } from "@/components/TelegramSupportLink";
import ThemeToggle from "@/components/ThemeToggle";

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const plan = searchParams.get("plan");

  if (plan === "turnkey") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 relative">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="max-w-md w-full glass rounded-2xl p-8 text-center">
          <MessageCircle className="w-14 h-14 mx-auto mb-4 text-primary" />
          <h1 className="font-heading font-bold text-xl mb-2">Спасибо за оплату!</h1>
          <p className="text-muted-foreground mb-6">
            Тариф «Под ключ» — индивидуальная разработка. Напишите в техподдержку — и мы свяжемся с вами для настройки решения.
          </p>
          <TelegramSupportLink variant="button" label="Написать в техподдержку" />
          <Link to="/" className="block mt-4">
            <Button variant="ghost" size="sm">На главную</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="max-w-md w-full glass rounded-2xl p-8 text-center">
        <CheckCircle className="w-14 h-14 mx-auto mb-4 text-primary" />
        <h1 className="font-heading font-bold text-xl mb-2">Оплата прошла успешно!</h1>
        <p className="text-muted-foreground mb-6">
          Доступ к кабинету активирован. Вы можете начать создавать карусели.
        </p>
        <Link to="/dashboard">
          <Button className="bg-gradient-primary text-primary-foreground border-0 hover:opacity-90">
            Перейти в кабинет
          </Button>
        </Link>
        <Link to="/" className="block mt-4">
          <Button variant="ghost" size="sm">На главную</Button>
        </Link>
      </div>
    </div>
  );
};

export default PaymentSuccess;
