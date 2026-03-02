import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Проверяем что пользователь — админ
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const endpoint = url.searchParams.get("endpoint");
    const targetUserId = url.searchParams.get("userId");

    // ─── SET LIMIT ───
    if (endpoint === "set-limit" && targetUserId && req.method === "POST") {
      const reqBody = await req.json();
      const newLimit = reqBody.limit;
      // Upsert a custom limit in a simple way: store in profiles or a dedicated field
      // We'll use a generation_limit column on profiles
      await supabaseAdmin
        .from("profiles")
        .update({ generation_limit: newLimit })
        .eq("user_id", targetUserId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── CREATE USER ───
    if (endpoint === "create-user" && req.method === "POST") {
      const { email, password, trialDays } = await req.json();
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Email and password required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createError || !newUser?.user) {
        return new Response(JSON.stringify({ error: createError?.message || "Failed to create user" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const newUserId = newUser.user.id;
      if (trialDays && trialDays > 0) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + trialDays);
        await supabaseAdmin.from("subscriptions").insert({
          user_id: newUserId,
          plan: "trial",
          status: "active",
          starts_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        });
      }
      return new Response(JSON.stringify({ success: true, userId: newUserId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // ─── OVERVIEW ───
    if (endpoint === "overview") {
      const [
        { count: totalUsers },
        { count: activeSubscriptions },
        { data: payments },
        { data: recentActivity },
        { count: todayActivity },
      ] = await Promise.all([
        supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
        supabaseAdmin.from("subscriptions").select("*", { count: "exact", head: true })
          .eq("status", "active").gte("expires_at", new Date().toISOString()),
        supabaseAdmin.from("payments").select("amount"),
        supabaseAdmin.from("activity_log")
          .select("id, action, details, created_at, user_id")
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin.from("activity_log").select("*", { count: "exact", head: true })
          .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      ]);

      const totalRevenue = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

      return new Response(JSON.stringify({
        totalUsers: totalUsers || 0,
        activeSubscriptions: activeSubscriptions || 0,
        totalRevenue,
        todayActivity: todayActivity || 0,
        recentActivity: recentActivity || [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── USERS ───
    if (endpoint === "users") {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, display_name, email, created_at")
        .order("created_at", { ascending: false });

      if (!profiles) return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      const enriched = await Promise.all(profiles.map(async (p) => {
        const [
          { data: sub },
          { data: payments },
          { count: totalActions },
          { data: lastActivityArr },
        ] = await Promise.all([
          supabaseAdmin.from("subscriptions").select("plan, status, expires_at")
            .eq("user_id", p.user_id).eq("status", "active")
            .gte("expires_at", new Date().toISOString()).maybeSingle(),
          supabaseAdmin.from("payments").select("amount").eq("user_id", p.user_id),
          supabaseAdmin.from("user_activity").select("*", { count: "exact", head: true })
            .eq("user_id", p.user_id),
          supabaseAdmin.from("user_activity").select("created_at")
            .eq("user_id", p.user_id).order("created_at", { ascending: false }).limit(1),
        ]);

        return {
          user_id: p.user_id,
          display_name: p.display_name,
          email: p.email,
          created_at: p.created_at,
          subscription: sub || null,
          totalPayments: payments?.length || 0,
          totalSpent: payments?.reduce((s, pay) => s + (pay.amount || 0), 0) || 0,
          totalActions: totalActions || 0,
          lastActive: lastActivityArr?.[0]?.created_at || null,
        };
      }));

      return new Response(JSON.stringify(enriched), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── USER DETAIL ───
    if (endpoint === "user-detail" && targetUserId) {
      // Count generations this month
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [
        { data: profile },
        { data: subscriptions },
        { data: payments },
        { data: activity },
        { data: generationLogs },
        { count: monthGenCount },
      ] = await Promise.all([
        supabaseAdmin.from("profiles").select("display_name, email, created_at, generation_limit")
          .eq("user_id", targetUserId).maybeSingle(),
        supabaseAdmin.from("subscriptions").select("id, plan, status, starts_at, expires_at")
          .eq("user_id", targetUserId).order("created_at", { ascending: false }),
        supabaseAdmin.from("payments").select("id, amount, plan, created_at")
          .eq("user_id", targetUserId).order("created_at", { ascending: false }),
        supabaseAdmin.from("activity_log").select("id, action, details, created_at")
          .eq("user_id", targetUserId).order("created_at", { ascending: false }).limit(50),
        supabaseAdmin.from("generation_logs").select("id, style, created_at, duration_ms, error, api_provider")
          .eq("user_id", targetUserId).order("created_at", { ascending: false }).limit(50),
        supabaseAdmin.from("generation_logs").select("*", { count: "exact", head: true })
          .eq("user_id", targetUserId)
          .gte("created_at", monthStart.toISOString())
          .is("error", null),
      ]);

      return new Response(JSON.stringify({
        profile,
        subscriptions: subscriptions || [],
        payments: payments || [],
        activity: activity || [],
        generationLogs: generationLogs || [],
        monthGenCount: monthGenCount || 0,
        generationLimit: profile?.generation_limit || 200,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown endpoint" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("admin-stats error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});