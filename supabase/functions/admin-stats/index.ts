import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Verify caller is admin
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const { data: roleData } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleData) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const endpoint = url.searchParams.get("endpoint");

  // ── OVERVIEW ──
  if (endpoint === "overview") {
    const [
      { count: totalUsers },
      { count: activeSubscriptions },
      { data: revenueData },
      { count: todayActivity },
      { data: recentActivity },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active").gte("expires_at", new Date().toISOString()),
      supabaseAdmin.from("payments").select("amount").eq("status", "completed"),
      supabaseAdmin.from("activity_log").select("*", { count: "exact", head: true }).gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      supabaseAdmin.from("activity_log").select("id, action, details, created_at, user_id").order("created_at", { ascending: false }).limit(50),
    ]);

    const totalRevenue = (revenueData || []).reduce((sum, p) => sum + (p.amount || 0), 0);

    // Enrich activity with profile data
    const userIds = [...new Set((recentActivity || []).map((a) => a.user_id))];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, display_name, email")
      .in("user_id", userIds);

    const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));
    const enrichedActivity = (recentActivity || []).map((a) => ({
      ...a,
      profiles: profileMap[a.user_id] || { display_name: null, email: "—" },
    }));

    return new Response(
      JSON.stringify({ totalUsers, activeSubscriptions, totalRevenue, todayActivity, recentActivity: enrichedActivity }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── USERS LIST ──
  if (endpoint === "users") {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, display_name, email, created_at")
      .order("created_at", { ascending: false });

    if (!profiles) return new Response(JSON.stringify([]), { headers: corsHeaders });

    const userIds = profiles.map((p) => p.user_id);

    const [
      { data: subscriptions },
      { data: payments },
      { data: activities },
    ] = await Promise.all([
      supabaseAdmin.from("subscriptions").select("user_id, plan, status, expires_at").in("user_id", userIds),
      supabaseAdmin.from("payments").select("user_id, amount, status").in("user_id", userIds),
      supabaseAdmin.from("activity_log").select("user_id, created_at").in("user_id", userIds).order("created_at", { ascending: false }),
    ]);

    const subMap: Record<string, any> = {};
    for (const s of subscriptions || []) {
      if (!subMap[s.user_id]) subMap[s.user_id] = s;
    }

    const paymentMap: Record<string, { count: number; total: number }> = {};
    for (const p of payments || []) {
      if (!paymentMap[p.user_id]) paymentMap[p.user_id] = { count: 0, total: 0 };
      paymentMap[p.user_id].count++;
      if (p.status === "completed") paymentMap[p.user_id].total += p.amount || 0;
    }

    const activityMap: Record<string, { count: number; last: string }> = {};
    for (const a of activities || []) {
      if (!activityMap[a.user_id]) {
        activityMap[a.user_id] = { count: 0, last: a.created_at };
      }
      activityMap[a.user_id].count++;
    }

    const enriched = profiles.map((p) => ({
      user_id: p.user_id,
      display_name: p.display_name,
      email: p.email,
      created_at: p.created_at,
      subscription: subMap[p.user_id] || null,
      totalPayments: paymentMap[p.user_id]?.count || 0,
      totalSpent: paymentMap[p.user_id]?.total || 0,
      totalActions: activityMap[p.user_id]?.count || 0,
      lastActive: activityMap[p.user_id]?.last || null,
    }));

    return new Response(JSON.stringify(enriched), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ── USER DETAIL ──
  if (endpoint === "user-detail") {
    const userId = url.searchParams.get("userId");
    if (!userId) return new Response(JSON.stringify({ error: "userId required" }), { status: 400, headers: corsHeaders });

    const [
      { data: profile },
      { data: subscriptions },
      { data: payments },
      { data: activity },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("display_name, email, created_at").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("subscriptions").select("id, plan, status, starts_at, expires_at").eq("user_id", userId).order("created_at", { ascending: false }),
      supabaseAdmin.from("payments").select("id, amount, plan, created_at, label").eq("user_id", userId).order("created_at", { ascending: false }),
      supabaseAdmin.from("activity_log").select("id, action, details, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    ]);

    return new Response(
      JSON.stringify({ profile, subscriptions, payments, activity }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ error: "Unknown endpoint" }), { status: 400, headers: corsHeaders });
});
