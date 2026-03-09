-- RLS policies for activity_log
CREATE POLICY "Users can insert own activity" ON activity_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own activity" ON activity_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all activity" ON activity_log FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for generation_logs
CREATE POLICY "Users can insert own generation logs" ON generation_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own generation logs" ON generation_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all generation logs" ON generation_logs FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for subscriptions (currently missing)
CREATE POLICY "Users can read own subscriptions" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all subscriptions" ON subscriptions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for payments (currently missing)
CREATE POLICY "Users can read own payments" ON payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own payments" ON payments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can read all payments" ON payments FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin read policy for profiles (admins need to read other users' profiles)
CREATE POLICY "Admins can read all profiles" ON profiles FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));