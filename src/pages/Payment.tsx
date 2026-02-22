import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Copy, Sparkles, LogIn, Check } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import type { Session } from "@supabase/supabase-js";

const plans = [
  {
    id: "full_ai",
    name: "Всё включено",
    price: "490 ₽",
    amount: 490,
    icon: Sparkles,
    desc: "Готовые PNG-слайды автоматически",
    highlight: true,
    features: [
      "Генерация до 200 каруселей",
      "Готовое описание для карусели",
      "Очистка метаданных",
      "Скачивание ZIP одним кликом",
    ],
  },
  {
    id: "turnkey",
    name: "Под ключ",
    price: "15 000 ₽",
    amount: 15000,
    icon: Copy,
    desc: "Индивидуальная установка с сопровождением",
    highlight: false,
    features: [
      "Пожизненное пользование",
      "API-ключ на 90 дней",
      "Индивидуальный стиль",
      "Запуск до 3-х дней",
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
    if (!selectedPlan) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-payment", {
        body: { plan: selectedPlan },
      });
      if (error) throw error;
      if (data?.paymentUrl) {
        window.open(data.paymentUrl, "_blank");
      } else {
        throw new Error("No payment URL");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Ошибка создания платежа");
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

        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          {plans.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            const Icon = plan.icon;
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
                {plan.highlight && (
                  <div className="absolute top-0 left-0 right-0 bg-gradient-primary text-primary-foreground text-[10px] font-bold py-1 uppercase tracking-wider text-center">
                    Популярный
                  </div>
                )}
                <div className={plan.highlight ? "pt-3" : ""}>
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
                  <p className="text-xs text-muted-foreground mb-3">{plan.highlight ? "в месяц" : "единоразово"}</p>
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
