// YooMoney HTTP notification handler
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Parse form data (application/x-www-form-urlencoded)
    const formData = await req.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      params[key] = value.toString();
    }

    const {
      notification_type,
      operation_id,
      amount,
      currency,
      datetime,
      sender,
      codepro,
      label,
      sha1_hash,
    } = params;

    console.log("YooMoney notification received:", {
      notification_type,
      operation_id,
      amount,
      label,
    });

    // Verify sha1_hash
    const secret = Deno.env.get("YOOMONEY_SECRET");
    if (!secret) {
      console.error("YOOMONEY_SECRET not set");
      return new Response("Server error", { status: 500 });
    }

    // Format: notification_type&operation_id&amount&currency&datetime&sender&codepro&notification_secret&label
    const hashString = `${notification_type}&${operation_id}&${amount}&${currency}&${datetime}&${sender}&${codepro}&${secret}&${label}`;
    
    // Calculate SHA-1 hash
    const encoder = new TextEncoder();
    const hashData = encoder.encode(hashString);
    const hashBuffer = await crypto.subtle.digest("SHA-1", hashData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const calculatedHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    if (calculatedHash !== sha1_hash) {
      console.error("Invalid sha1_hash. Expected:", calculatedHash, "Got:", sha1_hash);
      return new Response("Invalid hash", { status: 400 });
    }

    // Get Supabase credentials
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Supabase credentials not set");
      return new Response("Server error", { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Update payment status
    const { data, error } = await supabase
      .from("payments")
      .update({
        status: "success",
        payment_id: operation_id,
      })
      .eq("label", label)
      .select();

    if (error) {
      console.error("Payment update error:", error);
      return new Response("Database error", { status: 500 });
    }

    if (!data || data.length === 0) {
      console.warn("Payment not found for label:", label);
      // Still return 200 OK to prevent YooMoney from retrying
      return new Response("OK", { status: 200 });
    }

    console.log("Payment updated successfully:", data[0]);

    const payment = data[0] as { user_id: string; plan: string };
    const { user_id, plan } = payment;

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const subRow = {
      plan: plan === "full_ai" ? "full_ai" : "turnkey",
      status: "active",
      starts_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    const { data: existingSub } = await supabase.from("subscriptions").select("id").eq("user_id", user_id).maybeSingle();
    if (existingSub) {
      await supabase.from("subscriptions").update(subRow).eq("user_id", user_id);
    } else {
      await supabase.from("subscriptions").insert({ user_id, ...subRow });
    }

    if (plan === "full_ai") {
      await supabase.from("profiles").update({ generation_limit: 100 }).eq("user_id", user_id);
    }

    // Return 200 OK (required by YooMoney)
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("yoomoney-notify error:", err);
    return new Response("Server error", { status: 500 });
  }
});
