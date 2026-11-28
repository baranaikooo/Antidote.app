-- 1. Fix mutable search_path on SECURITY DEFINER functions (all refs are already schema-qualified)
ALTER FUNCTION public.delete_own_user() SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.protect_liveness_verified() SET search_path = '';
ALTER FUNCTION public.handle_blind_vote() SET search_path = '';
ALTER FUNCTION public.handle_blind_vote_inserted() SET search_path = '';
ALTER FUNCTION public.update_bandit_state(text, double precision, bigint) SET search_path = '';

-- 2. Revoke public/anon execution on trigger/internal/auth-only SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_liveness_verified() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_blind_vote() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_blind_vote_inserted() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_bandit_state(text, double precision, bigint) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.delete_own_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_user() TO authenticated;

-- 3. Add covering indexes for unindexed foreign keys
CREATE INDEX IF NOT EXISTS matching_pilot_exposures_candidate_id_idx
  ON profile_private.matching_pilot_exposures (candidate_id);
CREATE INDEX IF NOT EXISTS blind_votes_user_id_idx
  ON public.blind_votes (user_id);
CREATE INDEX IF NOT EXISTS conversation_pilot_responses_respondent_id_idx
  ON public.conversation_pilot_responses (respondent_id);
CREATE INDEX IF NOT EXISTS conversation_reads_reader_id_idx
  ON public.conversation_reads (reader_id);
CREATE INDEX IF NOT EXISTS conversation_reports_reporter_id_idx
  ON public.conversation_reports (reporter_id);
CREATE INDEX IF NOT EXISTS match_feedback_match_id_idx
  ON public.match_feedback (match_id);
CREATE INDEX IF NOT EXISTS match_feedback_user_p_idx
  ON public.match_feedback (user_p);
CREATE INDEX IF NOT EXISTS matches_user_q_idx
  ON public.matches (user_q);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx
  ON public.messages (sender_id);

-- 4. Optimize auth.uid() calls in RLS policies with (select auth.uid())
DROP POLICY IF EXISTS "Users see own matches" ON public.matches;
CREATE POLICY "Users see own matches" ON public.matches
  FOR SELECT TO authenticated
  USING (user_p = (SELECT auth.uid()) OR user_q = (SELECT auth.uid()));

DROP POLICY IF EXISTS "insert_snippets" ON public.media_snippets;
CREATE POLICY "insert_snippets" ON public.media_snippets
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "update_snippets" ON public.media_snippets;
CREATE POLICY "update_snippets" ON public.media_snippets
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "delete_snippets" ON public.media_snippets;
CREATE POLICY "delete_snippets" ON public.media_snippets
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users read messages in their matches" ON public.messages;
CREATE POLICY "Users read messages in their matches" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = messages.match_id
        AND (m.user_p = (SELECT auth.uid()) OR m.user_q = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users send messages in their matches" ON public.messages;
CREATE POLICY "Users send messages in their matches" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = messages.match_id
        AND (m.user_p = (SELECT auth.uid()) OR m.user_q = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users see own blind votes" ON public.blind_votes;
CREATE POLICY "Users see own blind votes" ON public.blind_votes
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users submit own blind vote" ON public.blind_votes;
CREATE POLICY "Users submit own blind vote" ON public.blind_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = blind_votes.match_id
        AND (m.user_p = (SELECT auth.uid()) OR m.user_q = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users update own blind vote" ON public.blind_votes;
CREATE POLICY "Users update own blind vote" ON public.blind_votes
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "insert_profile" ON public.profiles;
CREATE POLICY "insert_profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "update_profile" ON public.profiles;
CREATE POLICY "update_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "delete_profile" ON public.profiles;
CREATE POLICY "delete_profile" ON public.profiles
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "select_ledger" ON public.psychometric_ledger;
CREATE POLICY "select_ledger" ON public.psychometric_ledger
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

do $$
begin
  if exists (
    select from unnest(array[
      'public.handle_new_user()',
      'public.protect_liveness_verified()',
      'public.handle_blind_vote()',
      'public.handle_blind_vote_inserted()',
      'public.update_bandit_state(text,double precision,bigint)'
    ]) as restricted(signature)
    where has_function_privilege('anon', signature, 'execute')
       or has_function_privilege('authenticated', signature, 'execute')
  ) or has_function_privilege('anon', 'public.delete_own_user()', 'execute')
     or not has_function_privilege('authenticated', 'public.delete_own_user()', 'execute')
     or not has_function_privilege('service_role', 'public.update_bandit_state(text,double precision,bigint)', 'execute')
  then
    raise exception 'Unexpected client permissions on privileged functions';
  end if;
end;
$$;
