// YooMoney (ЮMoney) QuickPay — создание платежа и возврат данных для формы
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
};

const PLANS: Record<string, { amount: number; label: string }> = {
  full_ai: { amount: 2990, label: "Всё включено" },
  turnkey: { amount: 10000, label: "Под ключ" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const plan = body?.plan;
    const planData = PLANS[plan];

    if (!planData) {
      return new Response(JSON.stringify({ error: "Invalid plan" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const wallet = Deno.env.get("YOOMONEY_WALLET");
    if (!wallet) {
      console.error("YOOMONEY_WALLET not set");
      return new Response(JSON.stringify({ error: "Payment not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const paymentId = crypto.randomUUID();
    const { error: insertError } = await supabaseAdmin.from("payments").insert({
      id: paymentId,
      user_id: user.id,
      plan,
      amount: planData.amount,
      status: "pending",
      label: paymentId,
    });

    if (insertError) {
      console.error("Payment insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create payment" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/$/, "") || "";
    const successURL = origin ? `${origin}/payment?success=1&label=${paymentId}` : "/payment?success=1";

    return new Response(
      JSON.stringify({
        formAction: "https://yoomoney.ru/quickpay/confirm",
        formData: {
          receiver: wallet,
          "quickpay-form": "button",
          sum: planData.amount,
          paymentType: "AC",
          label: paymentId,
          successURL,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-payment error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
