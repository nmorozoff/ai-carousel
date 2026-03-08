import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLANS: Record<string, { amount: number; label: string }> = {
  full_ai: { amount: 2990, label: "Carousel AI — Всё включено" },
  turnkey: { amount: 10000, label: "Carousel AI — Под ключ" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const yoomoneyWallet = Deno.env.get("YOOMONEY_WALLET");
    const siteUrl = Deno.env.get("SITE_URL");

    console.log("ENV check:", {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRole: !!serviceRoleKey,
      hasYoomoney: !!yoomoneyWallet,
      hasSiteUrl: !!siteUrl,
    });

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    // Authenticate user from Authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.error("Auth error:", claimsError?.message);
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    console.log("Authenticated user:", userId);

    const { plan } = await req.json();
    const planInfo = PLANS[plan];
    if (!planInfo) {
      return new Response(JSON.stringify({ error: "Unknown plan" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create payment record
    const label = `${userId}_${plan}_${Date.now()}`;
    const { error: insertError } = await supabaseAdmin.from("payments").insert({
      user_id: userId,
      plan,
      amount: planInfo.amount,
      label,
      status: "pending",
    });

    if (insertError) {
      console.error("Insert error:", insertError);
      throw new Error("Failed to create payment record");
    }

    const wallet = yoomoneyWallet || "";
    const successUrl = `${siteUrl || "https://ai-carousell.lovable.app"}/dashboard?payment=success`;

    // YooMoney quickpay form data
    const formData = {
      receiver: wallet,
      "quickpay-form": "shop",
      targets: planInfo.label,
      paymentType: "AC",
      sum: String(planInfo.amount),
      label,
      successURL: successUrl,
    };

    console.log("Payment created:", { userId, plan, label });

    return new Response(
      JSON.stringify({
        formAction: "https://yoomoney.ru/quickpay/confirm",
        formData,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("create-payment error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
