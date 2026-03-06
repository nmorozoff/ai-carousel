import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const SubscriptionGuard = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<"loading" | "active" | "inactive">("loading");

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus("inactive");
        return;
      }

      // Админ — всегда доступ без подписки
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
        .select("status, expires_at")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .maybeSingle();

      if (data && new Date(data.expires_at) > new Date()) {
        setStatus("active");
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

  return <>{children}</>;
};

export default SubscriptionGuard;
