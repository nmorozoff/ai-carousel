import { useState, useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ThemeToggle from "@/components/ThemeToggle";
import {
  ArrowLeft,
  Users,
  CreditCard,
  Activity,
  TrendingUp,
  Search,
  Loader2,
  ChevronRight,
  CalendarDays,
  Mail,
  User,
  Clock,
  ShieldCheck,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface OverviewData {
  totalUsers: number;
  activeSubscriptions: number;
  totalRevenue: number;
  todayActivity: number;
  recentActivity: Array<{
    id: string;
    action: string;
    details: Record<string, unknown>;
    created_at: string;
    profiles: { display_name: string; email: string };
  }>;
}

interface EnrichedUser {
  user_id: string;
  display_name: string;
  email: string;
  created_at: string;
  subscription: {
    plan: string;
    status: string;
    expires_at: string;
  } | null;
  totalPayments: number;
  totalSpent: number;
  totalActions: number;
  lastActive: string;
}

interface UserDetail {
  profile: { display_name: string; email: string; created_at: string };
  subscriptions: Array<{ id: string; plan: string; status: string; starts_at: string; expires_at: string }>;
  payments: Array<{ id: string; amount: number; plan: string; created_at: string; label: string }>;
  activity: Array<{ id: string; action: string; details: Record<string, unknown>; created_at: string }>;
}

const Admin = () => {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [users, setUsers] = useState<EnrichedUser[]>([]);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    checkAdminAndLoad();
  }, []);

  const checkAdminAndLoad = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) { setLoading(false); return; }
    setIsAdmin(true);

    await loadOverview();
    setLoading(false);
  };

  const loadOverview = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-stats?endpoint=overview`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const data = await response.json();
      if (data) setOverview(data);
    } catch (err) {
      console.error("Failed to load overview:", err);
    }
  };

  const loadUsers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-stats?endpoint=users`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const data = await response.json();
      if (data) setUsers(data);
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  };

  const loadUserDetail = async (userId: string) => {
    setDetailLoading(true);
    setSelectedUserId(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-stats?endpoint=user-detail&userId=${userId}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const data = await response.json();
      if (data) setUserDetail(data);
    } catch (err) {
      console.error("Failed to load user detail:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "users" && users.length === 0) {
      loadUsers();
    }
  }, [tab]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const filteredUsers = users.filter(
    (u) =>
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });

  const formatDateTime = (d: string) =>
    new Date(d).toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  const formatCurrency = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;

  const actionLabels: Record<string, string> = {
    generate_prompt: "Генерация промта",
    generate_slides: "Генерация слайдов",
    download_zip: "Скачивание ZIP",
    login: "Вход",
    signup: "Регистрация",
  };

  return (
    <div className="min-h-screen py-4 sm:py-8 px-3 sm:px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <Link to="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Дашборд</span>
          </Link>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-heading font-bold text-gradient">Админ-панель</h1>
          </div>
          <ThemeToggle />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview" className="gap-1.5">
              <TrendingUp className="w-4 h-4" />
              Обзор
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="w-4 h-4" />
              Пользователи
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-1.5">
              <Activity className="w-4 h-4" />
              Активность
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview">
            {overview ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                  {[
                    { label: "Пользователей", value: overview.totalUsers, icon: Users, color: "text-primary" },
                    { label: "Активных подписок", value: overview.activeSubscriptions, icon: CreditCard, color: "text-accent" },
                    { label: "Выручка", value: formatCurrency(overview.totalRevenue), icon: TrendingUp, color: "text-green-500" },
                    { label: "Действий сегодня", value: overview.todayActivity, icon: Activity, color: "text-blue-500" },
                  ].map((stat) => (
                    <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                      <Card className="glass">
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-3 mb-2">
                            <stat.icon className={`w-5 h-5 ${stat.color}`} />
                            <span className="text-xs text-muted-foreground">{stat.label}</span>
                          </div>
                          <p className="text-2xl font-heading font-bold">{stat.value}</p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                <Card className="glass">
                  <CardHeader>
                    <CardTitle className="text-base font-heading">Последняя активность</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {overview.recentActivity.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Пока нет активности</p>
                    ) : (
                      <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {overview.recentActivity.slice(0, 20).map((a) => (
                          <div key={a.id} className="flex items-center gap-3 text-sm border-b border-border/30 pb-2">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground text-xs w-32 shrink-0">
                              {formatDateTime(a.created_at)}
                            </span>
                            <span className="font-medium truncate">
                              {a.profiles?.display_name || a.profiles?.email}
                            </span>
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {actionLabels[a.action] || a.action}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}
          </TabsContent>

          {/* USERS TAB */}
          <TabsContent value="users">
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по имени или email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Card className="glass overflow-x-auto">
                <Table className="min-w-[500px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Пользователь</TableHead>
                      <TableHead>Тариф</TableHead>
                      <TableHead className="hidden md:table-cell">Потрачено</TableHead>
                      <TableHead className="hidden md:table-cell">Действий</TableHead>
                      <TableHead className="hidden md:table-cell">Последняя активность</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => (
                      <TableRow
                        key={u.user_id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => loadUserDetail(u.user_id)}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{u.display_name || "—"}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {u.subscription ? (
                            <Badge variant="default" className="text-xs">{u.subscription.plan}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Нет</Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{formatCurrency(u.totalSpent)}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{u.totalActions}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {u.lastActive ? formatDate(u.lastActive) : "—"}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredUsers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          {users.length === 0 ? (
                            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                          ) : (
                            "Ничего не найдено"
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </div>

            {/* User Detail Modal */}
            <AnimatePresence>
              {selectedUserId && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-start justify-center pt-12 px-4 overflow-y-auto"
                  onClick={() => { setSelectedUserId(null); setUserDetail(null); }}
                >
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="w-full max-w-2xl pb-12"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Card className="glass">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-base font-heading">Детали пользователя</CardTitle>
                        <Button variant="ghost" size="icon" onClick={() => { setSelectedUserId(null); setUserDetail(null); }}>
                          <X className="w-4 h-4" />
                        </Button>
                      </CardHeader>
                      <CardContent>
                        {detailLoading || !userDetail ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <div className="flex items-center gap-4 pb-4 border-b border-border/30">
                              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="w-6 h-6 text-primary" />
                              </div>
                              <div>
                                <p className="font-heading font-semibold">{userDetail.profile?.display_name || "—"}</p>
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                  <Mail className="w-3.5 h-3.5" />
                                  {userDetail.profile?.email}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                  <CalendarDays className="w-3.5 h-3.5" />
                                  Зарегистрирован: {formatDate(userDetail.profile?.created_at)}
                                </div>
                              </div>
                            </div>

                            <div>
                              <h3 className="text-sm font-heading font-semibold mb-2">Подписки</h3>
                              {userDetail.subscriptions.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Нет подписок</p>
                              ) : (
                                <div className="space-y-2">
                                  {userDetail.subscriptions.map((s) => (
                                    <div key={s.id} className="flex items-center justify-between text-sm bg-secondary/30 rounded-lg p-3">
                                      <div className="flex items-center gap-2">
                                        <Badge variant={s.status === "active" ? "default" : "outline"}>{s.plan}</Badge>
                                        <Badge variant={s.status === "active" ? "secondary" : "outline"}>{s.status}</Badge>
                                      </div>
                                      <span className="text-xs text-muted-foreground">
                                        {formatDate(s.starts_at)} — {formatDate(s.expires_at)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div>
                              <h3 className="text-sm font-heading font-semibold mb-2">Платежи</h3>
                              {userDetail.payments.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Нет платежей</p>
                              ) : (
                                <div className="space-y-2">
                                  {userDetail.payments.map((p) => (
                                    <div key={p.id} className="flex items-center justify-between text-sm bg-secondary/30 rounded-lg p-3">
                                      <div>
                                        <span className="font-medium">{formatCurrency(p.amount)}</span>
                                        <Badge variant="outline" className="ml-2 text-xs">{p.plan}</Badge>
                                      </div>
                                      <span className="text-xs text-muted-foreground">{formatDateTime(p.created_at)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div>
                              <h3 className="text-sm font-heading font-semibold mb-2">Активность</h3>
                              {userDetail.activity.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Нет активности</p>
                              ) : (
                                <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                                  {userDetail.activity.map((a) => (
                                    <div key={a.id} className="flex items-center gap-2 text-sm">
                                      <span className="text-xs text-muted-foreground w-28 shrink-0">
                                        {formatDateTime(a.created_at)}
                                      </span>
                                      <Badge variant="secondary" className="text-xs">
                                        {actionLabels[a.action] || a.action}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          {/* ACTIVITY TAB */}
          <TabsContent value="activity">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-base font-heading">Лента активности</CardTitle>
              </CardHeader>
              <CardContent>
                {overview?.recentActivity && overview.recentActivity.length > 0 ? (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {overview.recentActivity.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 text-sm border-b border-border/30 pb-2">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground text-xs w-32 shrink-0">
                          {formatDateTime(a.created_at)}
                        </span>
                        <span className="font-medium truncate">
                          {a.profiles?.display_name || a.profiles?.email}
                        </span>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {actionLabels[a.action] || a.action}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Пока нет активности</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
