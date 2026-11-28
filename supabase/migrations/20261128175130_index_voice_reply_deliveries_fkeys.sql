create index if not exists voice_reply_deliveries_match_id_idx
  on profile_private.voice_reply_deliveries (match_id);

create index if not exists voice_reply_deliveries_recipient_idx
  on profile_private.voice_reply_deliveries (recipient);
