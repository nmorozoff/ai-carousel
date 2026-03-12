import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Copy, PenTool, Sparkles, LogIn, Check } from "lucide-react";
import { TelegramSupportLink } from "@/components/TelegramSupportLink";
import ThemeToggle from "@/components/ThemeToggle";
import type { Session } from "@supabase/supabase-js";

const plans = [
  {
    id: "full_ai",
    name: "Всё включено",
    price: "2 990 ₽",
    amount: 2990,
    icon: Sparkles,
    desc: "Готовые PNG-слайды автоматически",
    highlight: true,
    features: [
      "Генерация 100 каруселей",
      "Возможность докупить дополнительные генерации",
      "Готовое описание для карусели",
      "Очистка метаданных",
      "Скачивание ZIP одним кликом",
    ],
  },
  {
    id: "turnkey",
    name: "Под ключ",
    price: "10 000 ₽",
    amount: 10000,
    icon: Copy,
    desc: "Индивидуальная разработка под ключ",
    highlight: false,
    features: [
      "Exclusive",
      "Пожизненное пользование",
      "API-ключ на 90 дней",
      "Индивидуальный стиль",
      "Запуск до 3-х дней",
    ],
  },
  {
    id: "done_for_you",
    name: "Готовая карусель",
    price: "150 ₽",
    amount: 150,
    icon: PenTool,
    desc: "Вы присылаете тезисы, тексты или рилсы — мы создаём карусель за вас",
    highlight: false,
    features: [
      "150 ₽ за одну карусель",
      "Вы предоставляете контент (тезисы, тексты, рилсы)",
      "Готовые PNG-слайды 1080×1350",
      "По всем вопросам — в техподдержку",
    ],
  },
];

const Payment = () => {
  const [searchParams] = useSearchParams();
  const preselectedPlan = searchParams.get("plan");
  const [selectedPlan, setSelectedPlan] = useState<string | null>(preselectedPlan);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setCheckingAuth(false);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setCheckingAuth(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handlePay = async () => {
    if (!selectedPlan || selectedPlan === "done_for_you") return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Войдите в аккаунт для оплаты");
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ plan: selectedPlan }),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg = data?.error || res.statusText || "Ошибка создания платежа";
        toast.error(errMsg);
        return;
      }

      if (!data?.formAction || !data?.formData) {
        toast.error("Некорректный ответ от сервера");
        return;
      }

      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.formAction;
      form.target = "_blank";
      Object.entries(data.formData).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Ошибка создания платежа");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-2xl">
        <Link to="/" className="block text-center mb-8">
          <h1 className="text-2xl font-heading font-bold text-gradient">CAROUSEL AI</h1>
        </Link>

        <h2 className="font-heading font-semibold text-xl text-center mb-6">
          Выберите тариф
        </h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {plans.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            const Icon = plan.icon;
            const hasBanner = plan.highlight || plan.id === "turnkey";
            return (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`glass rounded-2xl p-6 text-left transition-all relative overflow-hidden ${
                  isSelected
                    ? "ring-2 ring-primary border-primary/40"
                    : "border-border/50 hover:border-primary/30"
                }`}
              >
                {hasBanner && (
                  <div className="absolute top-0 left-0 right-0 bg-gradient-primary text-primary-foreground text-[10px] font-bold py-1 uppercase tracking-wider text-center">
                    {plan.id === "turnkey" ? "Exclusive" : "Популярный"}
                  </div>
                )}
                <div className={hasBanner ? "pt-3" : ""}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="font-heading font-bold text-base">{plan.name}</h3>
                      <p className="text-xs text-muted-foreground">{plan.desc}</p>
                    </div>
                  </div>
                  <div className="text-2xl font-heading font-bold text-gradient mb-1">{plan.price}</div>
                  <p className="text-xs text-muted-foreground mb-3">
                    {plan.highlight ? "в месяц" : plan.id === "done_for_you" ? "за карусель" : "единоразово"}
                  </p>
                  <ul className="space-y-1.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs">
                        <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                        <span className="text-secondary-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </button>
            );
          })}
        </div>

        <div className="max-w-sm mx-auto">
          {selectedPlan === "done_for_you" ? (
            <div className="flex flex-col items-center gap-4 w-full">
              <p className="text-sm text-muted-foreground text-center">
                Пришлите тезисы, тексты или рилсы в техподдержку — мы создадим карусель за вас. 150 ₽ за одну карусель.
              </p>
              <TelegramSupportLink
                variant="button"
                label="Написать в техподдержку"
                className="w-full flex justify-center h-12 text-base rounded-xl bg-gradient-primary text-primary-foreground border-0 hover:opacity-90 transition-opacity"
              />
            </div>
          ) : (
            <>
              {checkingAuth ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
              ) : session ? (
                <Button
                  onClick={handlePay}
                  disabled={loading || !selectedPlan}
                  className="w-full bg-gradient-primary text-primary-foreground border-0 hover:opacity-90 transition-opacity h-12 text-base"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Оплатить через ЮMoney"}
                </Button>
              ) : (
                <Link to={`/auth?redirect=/payment${selectedPlan ? `?plan=${selectedPlan}` : ""}`}>
                  <Button className="w-full bg-gradient-primary text-primary-foreground border-0 hover:opacity-90 transition-opacity h-12 text-base gap-2">
                    <LogIn className="w-4 h-4" />
                    Войти и оплатить
                  </Button>
                </Link>
              )}

              <div className="mt-6 pt-6 border-t border-border/50 flex flex-col items-center gap-3">
                <p className="text-xs text-muted-foreground">Вопросы по оплате?</p>
                <TelegramSupportLink variant="button" label="Написать в поддержку" />
              </div>
            </>
          )}

          <Link to="/" className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground mt-4 transition-colors">
            <ArrowLeft className="w-3 h-3" />
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Payment;