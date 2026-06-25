-- ============================================================
-- AviationJobTalent V2 — Migration 005: Activity event triggers
-- ============================================================
-- Created: 2026-06-04
--
-- Adds AFTER INSERT/UPDATE triggers that auto-create rows in
-- activity_events when marketplace actions occur.
-- The client never writes to activity_events directly — there
-- is intentionally no INSERT RLS policy for normal users.
--
-- Covered events:
--   offer_applications INSERT         → application_received  (→ company)
--   offer_applications UPDATE accepted → application_accepted (→ technician)
--   offer_applications UPDATE rejected → application_rejected (→ technician)
--   offer_requests INSERT              → direct_offer_received (→ technician)
--   offer_requests UPDATE accepted    → direct_offer_accepted  (→ company)
--   offer_requests UPDATE rejected    → direct_offer_rejected  (→ company)
--   chat_messages INSERT               → chat_message_received (→ other party)
--     entity_id = chat_room_id (not message id) — lets
--     getUnreadChatRoomIds() work via a plain Set of entity_ids.
--
-- All trigger functions are SECURITY DEFINER and swallow errors
-- so a failed event write never blocks the main operation.
--
-- Duplicate prevention (marketplace events): before inserting,
-- checks whether an identical event already exists for the same
-- (type, entity_id, recipient_scope). Chat events are NOT
-- deduplicated — every new message creates one event.
-- ============================================================


-- ── Helper: write one activity event ─────────────────────────

CREATE OR REPLACE FUNCTION _create_activity_event(
  p_type             activity_type,
  p_scope            activity_recipient_scope,
  p_technician_id    uuid,   -- NULL when scope = company
  p_company_id       uuid,   -- NULL when scope = technician
  p_actor_profile_id uuid,   -- NULL is acceptable
  p_entity_type      activity_entity_type,
  p_entity_id        uuid,
  p_offer_id         uuid    -- NULL is acceptable
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- For marketplace events skip if an identical event already exists.
  -- Chat events are NOT deduplicated (one event per message is expected).
  IF p_entity_type IN ('offer_application', 'offer_request') THEN
    IF EXISTS (
      SELECT 1 FROM activity_events
      WHERE type            = p_type
        AND entity_id       = p_entity_id
        AND recipient_scope = p_scope
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO activity_events (
    type,               recipient_scope,
    recipient_technician_id, recipient_company_id,
    actor_profile_id,   entity_type, entity_id, offer_id
  ) VALUES (
    p_type,             p_scope,
    p_technician_id,    p_company_id,
    p_actor_profile_id, p_entity_type, p_entity_id, p_offer_id
  );
EXCEPTION WHEN OTHERS THEN
  NULL; -- best-effort: never block the main operation
END;
$$;


-- ── offer_applications ────────────────────────────────────────

CREATE OR REPLACE FUNCTION _on_offer_application_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      -- Technician applied → notify company
      SELECT user_id INTO v_actor
        FROM technician_profiles WHERE id = NEW.technician_id;

      PERFORM _create_activity_event(
        'application_received', 'company',
        NULL, NEW.company_id,
        v_actor,
        'offer_application', NEW.id, NEW.offer_id
      );

    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
      IF NEW.status = 'accepted' THEN
        PERFORM _create_activity_event(
          'application_accepted', 'technician',
          NEW.technician_id, NULL,
          NULL,
          'offer_application', NEW.id, NEW.offer_id
        );
      ELSIF NEW.status = 'rejected' THEN
        PERFORM _create_activity_event(
          'application_rejected', 'technician',
          NEW.technician_id, NULL,
          NULL,
          'offer_application', NEW.id, NEW.offer_id
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_offer_application_activity
  AFTER INSERT OR UPDATE ON offer_applications
  FOR EACH ROW EXECUTE FUNCTION _on_offer_application_change();


-- ── offer_requests ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _on_offer_request_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      -- Company sent a direct offer → notify technician
      PERFORM _create_activity_event(
        'direct_offer_received', 'technician',
        NEW.technician_id, NULL,
        NULL,
        'offer_request', NEW.id, NEW.offer_id
      );

    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
      IF NEW.status = 'accepted' THEN
        PERFORM _create_activity_event(
          'direct_offer_accepted', 'company',
          NULL, NEW.company_id,
          NULL,
          'offer_request', NEW.id, NEW.offer_id
        );
      ELSIF NEW.status = 'rejected' THEN
        PERFORM _create_activity_event(
          'direct_offer_rejected', 'company',
          NULL, NEW.company_id,
          NULL,
          'offer_request', NEW.id, NEW.offer_id
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_offer_request_activity
  AFTER INSERT OR UPDATE ON offer_requests
  FOR EACH ROW EXECUTE FUNCTION _on_offer_request_change();


-- ── chat_messages ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _on_chat_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_room chat_rooms%ROWTYPE;
BEGIN
  BEGIN
    SELECT * INTO v_room FROM chat_rooms WHERE id = NEW.chat_room_id;
    IF v_room IS NULL THEN RETURN NULL; END IF;

    IF NEW.sender_role = 'technician' THEN
      -- Technician sent message → notify company
      -- entity_id = chat_room_id so getUnreadChatRoomIds works cleanly
      PERFORM _create_activity_event(
        'chat_message_received', 'company',
        NULL, v_room.company_id,
        NEW.sender_user_id,
        'chat_message', v_room.id, NULL
      );
    ELSE
      -- Company sent message → notify technician
      PERFORM _create_activity_event(
        'chat_message_received', 'technician',
        v_room.technician_id, NULL,
        NEW.sender_user_id,
        'chat_message', v_room.id, NULL
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_chat_message_activity
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION _on_chat_message_insert();
