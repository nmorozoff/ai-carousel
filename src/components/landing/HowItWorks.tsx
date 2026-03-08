import { motion } from "framer-motion";

const steps = [
  { num: "01", title: "Вставьте текст", desc: "Скопируйте текст поста, транскрибацию рилса или эфира в поле ввода." },
  { num: "02", title: "Выберите стиль", desc: "Выберите один из 5 стилей оформления карусели для вашей ниши." },
  { num: "03", title: "Генерация", desc: "ИИ создаст слайды, описание к карусели и очистит метаданные — соцсети не распознают ИИ." },
  { num: "04", title: "Скачайте результат", desc: "Получите готовые PNG слайды карусели и описание к ней." },
];

const HowItWorks = () => (
  <section id="how-it-works" className="py-24">
    <div className="container mx-auto px-4">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-3xl md:text-4xl font-heading font-bold text-center mb-4"
      >
        Как это работает
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="text-muted-foreground text-center mb-16"
      >
        Четыре простых шага до готового контента
      </motion.p>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-5xl mx-auto">
        {steps.map((s, i) => (
          <motion.div
            key={s.num}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.15 }}
            className="text-center"
          >
            <div className="text-4xl font-heading font-bold text-gradient mb-4">{s.num}</div>
            <h3 className="font-heading font-semibold text-lg mb-2">{s.title}</h3>
            <p className="text-sm text-muted-foreground">{s.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default HowItWorks;
