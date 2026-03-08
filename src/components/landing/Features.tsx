import { motion } from "framer-motion";
import { Layers, Palette, Download, Zap, Heart, ShieldCheck } from "lucide-react";

const features = [
  { icon: Layers, title: "5 промтов для каруселей", desc: "Готовые формулы для создания продающих, обучающих и вовлекающих каруселей." },
  { icon: Palette, title: "7 стилей визуалов", desc: "Уникальные стили генерации — от минимализма до ярких дизайнов под вашу нишу." },
  { icon: Download, title: "Скачайте и используйте", desc: "Получите готовые PNG слайды или промты для самостоятельной генерации." },
  { icon: ShieldCheck, title: "Очистка метаданных", desc: "Соцсети не распознают ИИ-контент — охваты не режутся, публикация безопасна." },
  { icon: Zap, title: "Моментальный результат", desc: "Вставьте текст — получите контент для каруселей за считанные минуты." },
  { icon: Heart, title: "Для мягких ниш", desc: "Адаптировано для психологов, коучей, нумерологов и других экспертов." },
];

const Features = () => (
  <section id="features" className="py-24">
    <div className="container mx-auto px-4">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-3xl md:text-4xl font-heading font-bold text-center mb-4"
      >
        Что внутри
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="text-muted-foreground text-center mb-16 max-w-md mx-auto"
      >
        Всё необходимое для создания профессионального контента с помощью ИИ
      </motion.p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="glass rounded-xl p-6 hover:border-primary/30 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center mb-4">
              <f.icon className="w-5 h-5 text-primary-foreground" />
            </div>
            <h3 className="font-heading font-semibold text-lg mb-2">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default Features;
