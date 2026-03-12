import { motion } from "framer-motion";
import { Check, Copy, PenTool, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { TelegramSupportLink } from "@/components/TelegramSupportLink";

const planIds: Record<string, string> = {
  "Всё включено": "full_ai",
  "Под ключ": "turnkey",
  "Готовая карусель": "done_for_you",
};

const plans = [
  {
    name: "Всё включено",
    price: "2 990 ₽",
    icon: Sparkles,
    desc: "Пост, транскрибация рилс, тезисы или мысли → готовые PNG-слайды автоматически",
    highlight: true,
    features: [
      "Генерация 100 каруселей",
      "Возможность докупить дополнительные генерации",
      "Готовые PNG слайды 1080×1350 (4:5) — сразу в соцсети",
      "Готовое описание для карусели",
      "Очистка метаданных — соцсети не распознают ИИ и не режут охваты",
      "Скачивание ZIP одним кликом",
      "Полная автоматизация — ноль усилий",
      "7 слайдов за секунды",
    ],
  },
  {
    name: "Под ключ",
    price: "10 000 ₽",
    icon: Copy,
    desc: "Индивидуальная разработка под ключ",
    highlight: false,
    features: [
      "Exclusive",
      "Пожизненное пользование сервисом",
      "Свой API-ключ для генерации на 90 дней",
      "Разработка одного индивидуального стиля",
      "Полное сопровождение и настройка",
      "Помощь в покупке и установке на хостинг",
      "Запуск до 3-х дней",
    ],
  },
  {
    name: "Готовая карусель",
    price: "150 ₽",
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
        Найдите подходящий вариант
      </motion.p>

      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {plans.map((plan, i) => {
          const planId = planIds[plan.name];
          const isDoneForYou = planId === "done_for_you";
          const hasBanner = plan.highlight || plan.name === "Под ключ";
          return (
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
              {hasBanner && (
                <div className="absolute top-0 left-0 right-0 bg-gradient-primary text-primary-foreground text-xs font-bold py-1.5 uppercase tracking-wider">
                  {plan.name === "Под ключ" ? "Exclusive" : "Популярный"}
                </div>
              )}
              <div className={`relative z-10 ${hasBanner ? "pt-4" : ""}`}>
                <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center mx-auto mb-4">
                  <plan.icon className="w-6 h-6 text-primary-foreground" />
                </div>
                <h3 className="font-heading font-bold text-xl mb-1">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">{plan.desc}</p>
                <div className="text-4xl font-heading font-bold text-gradient mb-1">{plan.price}</div>
                <p className="text-xs text-muted-foreground mb-6">
                  {plan.highlight ? "в месяц" : isDoneForYou ? "за карусель" : "единоразово"}
                </p>

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

                {isDoneForYou ? (
                  <div className="w-full">
                    <TelegramSupportLink
                      variant="button"
                      label="Написать в техподдержку"
                      className="w-full justify-center h-12 text-base rounded-xl bg-gradient-primary text-primary-foreground border-0 hover:opacity-90 transition-opacity flex"
                    />
                  </div>
                ) : (
                  <Link to={`/payment?plan=${planId}`}>
                    <Button
                      className="w-full border-0 hover:opacity-90 transition-opacity text-base h-12 bg-gradient-primary text-primary-foreground"
                    >
                      Купить доступ
                    </Button>
                  </Link>
                )}
                {!isDoneForYou && (
                  <p className="text-xs text-muted-foreground mt-4 flex items-center justify-center gap-2">
                    <TelegramSupportLink variant="minimal" label="Вопросы? Напишите в поддержку" iconSize={16} />
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  </section>
);

export default Pricing;
