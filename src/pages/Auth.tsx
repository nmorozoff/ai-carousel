import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail, Lock, User } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate(redirectTo);
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name } },
        });
        if (error) throw error;
        toast.success("Аккаунт создан! Проверьте email для подтверждения.");
      }
    } catch (error: any) {
      toast.error(error.message || "Произошла ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative bg-background">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="border border-border rounded-2xl p-8 bg-card shadow-sm">
          <Link to="/" className="flex items-center justify-center gap-2 mb-6">
            <h1 className="text-xl font-heading font-bold text-gradient">CAROUSEL AI</h1>
          </Link>

          <h2 className="font-heading font-bold text-2xl text-center text-foreground mb-2">
            Добро пожаловать
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Войдите или создайте аккаунт для доступа к сервису
          </p>

          {/* Tabs */}
          <div className="flex rounded-xl bg-muted p-1 mb-6">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                isLogin
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Вход
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                !isLogin
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Регистрация
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Имя</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Ваше имя"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10 h-12 rounded-xl bg-muted/50 border-border"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10 h-12 rounded-xl bg-muted/50 border-border"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Пароль</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder={isLogin ? "••••••••" : "Минимум 6 символов"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="pl-10 h-12 rounded-xl bg-muted/50 border-border"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl text-sm font-semibold bg-gradient-primary text-primary-foreground border-0 hover:opacity-90 transition-opacity"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isLogin ? (
                "Войти"
              ) : (
                "Создать аккаунт"
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-4">
            Нажимая кнопку, вы соглашаетесь с{" "}
            <a href="#" className="underline hover:text-foreground">
              условиями использования
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
