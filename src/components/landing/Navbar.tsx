import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LogOut, Menu, X } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { AnimatePresence, motion } from "framer-motion";

const Navbar = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  const scrollTo = (id: string) => {
    setMobileOpen(false);
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
                <Button size="sm" className="hidden sm:inline-flex bg-gradient-primary text-primary-foreground border-0 hover:opacity-90 transition-opacity">
                  Кабинет
                </Button>
              </Link>
              <Button size="sm" variant="ghost" onClick={handleLogout} className="hidden sm:inline-flex">
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <Link to="/auth" className="hidden sm:inline-flex">
              <Button size="sm" className="bg-gradient-primary text-primary-foreground border-0 hover:opacity-90 transition-opacity">
                Войти
              </Button>
            </Link>
          )}
          <Button size="sm" variant="ghost" className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden overflow-hidden border-t border-border/50 bg-card/95 backdrop-blur-xl"
          >
            <div className="flex flex-col gap-1 p-4">
              <button onClick={() => scrollTo("features")} className="text-sm text-muted-foreground hover:text-foreground py-2.5 text-left">
                Возможности
              </button>
              <button onClick={() => scrollTo("how-it-works")} className="text-sm text-muted-foreground hover:text-foreground py-2.5 text-left">
                Как работает
              </button>
              <button onClick={() => scrollTo("pricing")} className="text-sm text-muted-foreground hover:text-foreground py-2.5 text-left">
                Тариф
              </button>
              <div className="border-t border-border/50 mt-2 pt-3 flex gap-2">
                {session ? (
                  <>
                    <Link to="/dashboard" className="flex-1" onClick={() => setMobileOpen(false)}>
                      <Button size="sm" className="w-full bg-gradient-primary text-primary-foreground border-0">
                        Кабинет
                      </Button>
                    </Link>
                    <Button size="sm" variant="outline" onClick={handleLogout}>
                      <LogOut className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <Link to="/auth" className="flex-1" onClick={() => setMobileOpen(false)}>
                    <Button size="sm" className="w-full bg-gradient-primary text-primary-foreground border-0">
                      Войти
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
