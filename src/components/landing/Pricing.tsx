import { motion } from "framer-motion";
import { Check, Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const plans = [
  {
    name: "Prompt Only",
    price: "10 ₽",
    icon: Copy,
    desc: "Пост, транскрибация рилс, тезисы или мысли → готовый промт за секунды",
    highlight: false,
    features: [
      "Готовый мега-промт для Nanobanana Pro",
      "Текст + стиль оформления карусели",
      "Просто копи-паст — и слайды готовы",
      "Не нужно разбираться в ИИ",
      "Инструкция как подключить Nanobanana Pro за копейки на год — генерируй контент бесконечно",
    ],
  },
  {
    name: "Full AI",
    price: "10 ₽",
    icon: Sparkles,
    desc: "Пост, транскрибация рилс, тезисы или мысли → готовые PNG-слайды автоматически",
    highlight: true,
    features: [
      "Всё из тарифа Prompt Only",
      "Готовые PNG слайды 1080×1350 (4:5) — сразу в соцсети",
      "Очистка метаданных — соцсети не распознают ИИ и не режут охваты (в разработке 🚧)",
      "Скачивание ZIP одним кликом",
      "Полная автоматизация — ноль усилий",
      "7 слайдов за секунды",
    ],
  },
];

const Pricing = () => (
  <section id="pricing" className="py-24">
    <div className="container mx-auto px-4">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-3xl md:text-4xl font-heading font-bold text-center mb-4"
      >
        Выберите тариф
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="text-muted-foreground text-center mb-12"
      >
        Одна оплата — навсегда ваше
      </motion.p>

      <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {plans.map((plan, i) => (
          <motion.div
            key={plan.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.15 }}
            className={`glass rounded-2xl p-8 text-center relative overflow-hidden ${
              plan.highlight ? "border-primary/40" : ""
            }`}
          >
            {plan.highlight && (
              <div className="absolute top-0 left-0 right-0 bg-gradient-primary text-primary-foreground text-xs font-bold py-1.5 uppercase tracking-wider">
                Популярный
              </div>
            )}
            <div className={`relative z-10 ${plan.highlight ? "pt-4" : ""}`}>
              <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center mx-auto mb-4">
                <plan.icon className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="font-heading font-bold text-xl mb-1">{plan.name}</h3>
              <p className="text-sm text-muted-foreground mb-4">{plan.desc}</p>
              <div className="text-4xl font-heading font-bold text-gradient mb-1">{plan.price}</div>
              <p className="text-xs text-muted-foreground mb-6">в месяц</p>

              <ul className="text-left space-y-3 mb-8">
                {plan.features.map((f) => {
                  const isWip = f.includes("в разработке");
                  return (
                    <li key={f} className="flex items-start gap-3 text-sm">
                      <Check className={`w-4 h-4 mt-0.5 shrink-0 ${isWip ? "text-muted-foreground/50" : "text-primary"}`} />
                      <span className={isWip ? "text-muted-foreground/60" : "text-secondary-foreground"}>{f}</span>
                    </li>
                  );
                })}
              </ul>

              <Link to={`/payment?plan=${plan.highlight ? "full_ai" : "prompt_only"}`}>
                <Button
                  className="w-full border-0 hover:opacity-90 transition-opacity text-base h-12 bg-gradient-primary text-primary-foreground"
                >
                  Купить доступ
                </Button>
              </Link>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default Pricing;
