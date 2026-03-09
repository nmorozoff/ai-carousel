import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user JWT
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub as string;

    // Check admin role using service client
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const endpoint = url.searchParams.get("endpoint");

    if (endpoint === "overview") {
      const { count: totalUsers } = await admin.from("profiles").select("*", { count: "exact", head: true });
      const { count: activeSubscriptions } = await admin.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active");
      const { data: payments } = await admin.from("payments").select("amount").eq("status", "paid");
      const totalRevenue = payments?.reduce((s, p) => s + Number(p.amount), 0) || 0;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: todayActivity } = await admin.from("activity_log").select("*", { count: "exact", head: true }).gte("created_at", today.toISOString());

      const { data: recentActivity } = await admin
        .from("activity_log")
        .select("id, action, details, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(50);

      // Enrich with profile info
      const userIds = [...new Set(recentActivity?.map((a) => a.user_id) || [])];
      const { data: profiles } = await admin.from("profiles").select("user_id, display_name, email").in("user_id", userIds);
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

      const enrichedActivity = recentActivity?.map((a) => ({
        ...a,
        profiles: profileMap.get(a.user_id) || { display_name: null, email: null },
      })) || [];

      return new Response(JSON.stringify({ totalUsers, activeSubscriptions, totalRevenue, todayActivity, recentActivity: enrichedActivity }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (endpoint === "users") {
      const { data: profiles } = await admin.from("profiles").select("user_id, display_name, email, created_at");
      if (!profiles) return new Response(JSON.stringify([]), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const userIds = profiles.map((p) => p.user_id);
      const { data: subs } = await admin.from("subscriptions").select("user_id, plan, status, expires_at").in("user_id", userIds).eq("status", "active");
      const { data: pays } = await admin.from("payments").select("user_id, amount").in("user_id", userIds).eq("status", "paid");
      const { data: acts } = await admin.from("activity_log").select("user_id, created_at").in("user_id", userIds).order("created_at", { ascending: false });

      const subMap = new Map(subs?.map((s) => [s.user_id, s]) || []);
      const payMap = new Map<string, { count: number; total: number }>();
      pays?.forEach((p) => {
        const e = payMap.get(p.user_id) || { count: 0, total: 0 };
        e.count++;
        e.total += Number(p.amount);
        payMap.set(p.user_id, e);
      });
      const actMap = new Map<string, { count: number; last: string }>();
      acts?.forEach((a) => {
        const e = actMap.get(a.user_id);
        if (!e) actMap.set(a.user_id, { count: 1, last: a.created_at });
        else e.count++;
      });

      const enriched = profiles.map((p) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        email: p.email,
        created_at: p.created_at,
        subscription: subMap.get(p.user_id) || null,
        totalPayments: payMap.get(p.user_id)?.count || 0,
        totalSpent: payMap.get(p.user_id)?.total || 0,
        totalActions: actMap.get(p.user_id)?.count || 0,
        lastActive: actMap.get(p.user_id)?.last || "",
      }));

      return new Response(JSON.stringify(enriched), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (endpoint === "user-detail") {
      const targetUserId = url.searchParams.get("userId");
      if (!targetUserId) return new Response(JSON.stringify({ error: "Missing userId" }), { status: 400, headers: corsHeaders });

      const { data: profile } = await admin.from("profiles").select("display_name, email, created_at, generation_limit, gemini_api_key, grsai_api_key, preferred_api").eq("user_id", targetUserId).maybeSingle();
      const { data: subscriptions } = await admin.from("subscriptions").select("id, plan, status, starts_at, expires_at").eq("user_id", targetUserId).order("created_at", { ascending: false });
      const { data: payments } = await admin.from("payments").select("id, amount, plan, created_at, label").eq("user_id", targetUserId).order("created_at", { ascending: false });
      const { data: activity } = await admin.from("activity_log").select("id, action, details, created_at").eq("user_id", targetUserId).order("created_at", { ascending: false }).limit(50);
      const { data: generationLogs } = await admin.from("generation_logs").select("id, style, created_at, duration_ms, error, api_provider").eq("user_id", targetUserId).order("created_at", { ascending: false }).limit(50);

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { count: monthGenCount } = await admin.from("generation_logs").select("*", { count: "exact", head: true }).eq("user_id", targetUserId).gte("created_at", monthStart.toISOString());

      return new Response(JSON.stringify({
        profile: profile ? { display_name: profile.display_name, email: profile.email, created_at: profile.created_at, generation_limit: profile.generation_limit } : null,
        apiKeys: { gemini: profile?.gemini_api_key || "", grsai: profile?.grsai_api_key || "", preferred: profile?.preferred_api || "gemini" },
        subscriptions: subscriptions || [],
        payments: payments || [],
        activity: activity || [],
        generationLogs: generationLogs || [],
        monthGenCount: monthGenCount || 0,
        generationLimit: profile?.generation_limit || 200,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (endpoint === "set-limit" && req.method === "POST") {
      const { limit } = await req.json();
      const targetUserId = url.searchParams.get("userId");
      if (!targetUserId) return new Response(JSON.stringify({ error: "Missing userId" }), { status: 400, headers: corsHeaders });
      await admin.from("profiles").update({ generation_limit: limit }).eq("user_id", targetUserId);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (endpoint === "save-api-keys" && req.method === "POST") {
      const { targetUserId, gemini_api_key, grsai_api_key, preferred_api } = await req.json();
      if (!targetUserId) return new Response(JSON.stringify({ error: "Missing targetUserId" }), { status: 400, headers: corsHeaders });
      const { error } = await admin.from("profiles").update({ gemini_api_key: gemini_api_key || null, grsai_api_key: grsai_api_key || null, preferred_api }).eq("user_id", targetUserId);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (endpoint === "give-trial" && req.method === "POST") {
      const { targetUserId, trialDays } = await req.json();
      if (!targetUserId) return new Response(JSON.stringify({ error: "Missing targetUserId" }), { status: 400, headers: corsHeaders });
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (trialDays || 7));
      const { error } = await admin.from("subscriptions").upsert({
        user_id: targetUserId,
        plan: "trial",
        status: "active",
        starts_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (endpoint === "create-user" && req.method === "POST") {
      const { email, password, trialDays: days } = await req.json();
      if (!email || !password) return new Response(JSON.stringify({ error: "Missing email/password" }), { status: 400, headers: corsHeaders });
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (createErr || !newUser?.user) return new Response(JSON.stringify({ success: false, error: createErr?.message || "Failed" }), { status: 400, headers: corsHeaders });
      if (days && days > 0) {
        const exp = new Date();
        exp.setDate(exp.getDate() + days);
        await admin.from("subscriptions").insert({ user_id: newUser.user.id, plan: "trial", status: "active", starts_at: new Date().toISOString(), expires_at: exp.toISOString() });
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown endpoint" }), { status: 400, headers: corsHeaders });
  } catch (err) {
    console.error("admin-stats error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: corsHeaders });
  }
});
