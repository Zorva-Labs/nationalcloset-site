// Proposal expiration — shared constants and customer-facing wording.
//
// Every sent proposal is valid for EXPIRY_DAYS days (set on send.js as
// valid_until = sent_at + EXPIRY_DAYS). Because material, shipping, and labor
// costs fluctuate, we can't hold a quoted price open indefinitely. The same
// explanation appears on the proposal page, in the proposal email, and in the
// automated "expires tomorrow" reminder — keep the copy here so it stays in sync.

export const EXPIRY_DAYS = 2;

// SQL fragment: how long a proposal is valid from the moment it's sent.
export const VALID_UNTIL_SQL = `datetime('now','+${EXPIRY_DAYS} days')`;

// Render a stored valid_until (a UTC "YYYY-MM-DD HH:MM:SS" or date string, since
// SQLite datetime('now') is UTC) as a friendly US-Central date, e.g.
// "Wednesday, July 9". Returns "" if it can't be parsed.
export function formatExpiry(validUntil) {
  if (!validUntil) return "";
  const s = String(validUntil).trim();
  const iso = s.includes("T") ? s : s.replace(" ", "T") + (s.length <= 10 ? "T00:00:00Z" : "Z");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago",
  });
}

// The shared "why proposals expire" block for the customer emails (branded HTML).
// Pass the stored valid_until to name the exact date; omit it to stay generic.
export function expiryReasonHtml(validUntil) {
  const on = validUntil ? ` — on <strong>${formatExpiry(validUntil)}</strong>` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="background:#F6E6DF;border-left:4px solid #D2683F;border-radius:8px;padding:15px 18px">
      <p style="margin:0;font-size:14px;line-height:1.62;color:#3A362F">
        <strong style="color:#B9542F;font-size:15px">Heads up — this proposal is valid for ${EXPIRY_DAYS} days${on}.</strong><br/>
        Because the cost of materials, shipping, and labor can change from week to week, we can only guarantee this pricing for ${EXPIRY_DAYS} days from the day it was sent. After it expires the price may change — but just reply to this email or call us and we'll gladly put together an updated proposal for you.
      </p>
    </td></tr></table>`;
}
