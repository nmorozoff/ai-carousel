import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TelegramSupportLink } from "@/components/TelegramSupportLink";

const SubscriptionGuard = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<"loading" | "active" | "turnkey" | "inactive">("loading");

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus("inactive");
        return;
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (roleData) {
        setStatus("active");
        return;
      }

      const { data } = await supabase
        .from("subscriptions")
        .select("status, expires_at, plan")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .maybeSingle();

      if (data && new Date(data.expires_at) > new Date()) {
        if (data.plan === "turnkey") {
          setStatus("turnkey");
        } else {
          setStatus("active");
        }
      } else {
        setStatus("inactive");
      }
    };

    check();
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "inactive") {
    return <Navigate to="/payment" replace />;
  }

  if (status === "turnkey") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full glass rounded-2xl p-8 text-center">
          <MessageCircle className="w-12 h-12 mx-auto mb-4 text-primary" />
          <h2 className="font-heading font-semibold text-xl mb-2">Тариф «Под ключ»</h2>
          <p className="text-muted-foreground mb-6">
            Напишите в техподдержку — и мы свяжемся с вами для настройки индивидуального решения.
          </p>
          <TelegramSupportLink variant="button" label="Написать в техподдержку" />
          <Link to="/" className="block mt-4">
            <Button variant="ghost" size="sm">На главную</Button>
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default SubscriptionGuard;
