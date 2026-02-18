import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LogOut } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const Navbar = () => {
  const [session, setSession] = useState<Session | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link to="/" className="text-xl font-heading font-bold text-gradient">
          CAROUSEL AI
        </Link>
        <div className="hidden md:flex items-center gap-8">
          <button onClick={() => scrollTo("features")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Возможности
          </button>
          <button onClick={() => scrollTo("how-it-works")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Как работает
          </button>
          <button onClick={() => scrollTo("pricing")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Тариф
          </button>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {session ? (
            <>
              <Link to="/dashboard">
                <Button size="sm" className="bg-gradient-primary text-primary-foreground border-0 hover:opacity-90 transition-opacity">
                  Кабинет
                </Button>
              </Link>
              <Button size="sm" variant="ghost" onClick={handleLogout}>
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <Link to="/auth">
              <Button size="sm" className="bg-gradient-primary text-primary-foreground border-0 hover:opacity-90 transition-opacity">
                Войти
              </Button>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
