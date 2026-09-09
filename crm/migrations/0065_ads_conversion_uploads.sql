-- Google Ads offline conversion uploads (booked consultations → "Booked consultation (CRM import)").
-- One row per appointment uploaded, so the daily job never re-sends a conversion.
CREATE TABLE IF NOT EXISTS ads_conversion_uploads (
  appointment_id  INTEGER PRIMARY KEY,
  lead_id         INTEGER,
  click_id        TEXT NOT NULL,           -- gclid / gbraid / wbraid value
  click_id_kind   TEXT NOT NULL,           -- gclid | gbraid | wbraid
  conversion_time TEXT NOT NULL,           -- as sent to Google, "YYYY-MM-DD HH:MM:SS-05:00"
  uploaded_at     TEXT NOT NULL DEFAULT (datetime('now')),
  result          TEXT                     -- JSON from Google (partial-failure detail if any)
);
