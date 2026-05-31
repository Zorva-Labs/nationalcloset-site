// Job-stage notification emails. When a project moves to a post-signature
// stage (Booked → Scheduled → Installing → Completed) we email the client the
// template bound to that stage and log it to Messages.
//
// Templates live in the email_templates table (bind_project_status = the
// status), so the copy is editable from the CRM. The stored body_html is the
// INNER content; we wrap it in the branded shell (logo + fonts + signature)
// at send time. Best-effort: never throws.
import { sendEmail, makeMessageId, brandedEmail } from "./email.js";
import { buildEmailContext, renderTemplate } from "./email-vars.js";
import { logOutboundEmail } from "./email-log.js";
import { recordActivity } from "./db.js";

// Post-signature project status → the email_template kind that announces it.
export const STAGE_EMAIL_KIND = {
  contracted:        "job_booked",
  scheduled_install: "job_scheduled",
  installing:        "job_installing",
  completed:         "job_completed",
};

function fmtDay(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  // Parse as UTC + format in UTC so a bare YYYY-MM-DD never shifts a day.
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

export async function sendStageEmail(env, newStatus, projectId, actor = {}) {
  try {
    const db = env.DB;
    const kind = STAGE_EMAIL_KIND[newStatus];
    if (!kind) return { skipped: true, reason: "not_a_stage" };

    // Prefer a template explicitly bound to this status; fall back to one
    // matching the stage kind. Inactive templates are ignored (lets the admin
    // switch off a stage email without deleting it).
    const tpl = await db.prepare(
      `SELECT * FROM email_templates
        WHERE is_active = 1 AND (bind_project_status = ?1 OR kind = ?2)
        ORDER BY (bind_project_status = ?1) DESC, id LIMIT 1`
    ).bind(newStatus, kind).first();
    if (!tpl) return { skipped: true, reason: "no_template" };

    const project = await db.prepare(
      `SELECT p.*, c.name AS contact_name, c.email AS contact_email
         FROM projects p JOIN contacts c ON c.id = p.contact_id WHERE p.id = ?1`
    ).bind(projectId).first();
    if (!project) return { skipped: true, reason: "no_project" };
    if (!project.contact_email) return { skipped: true, reason: "no_email" };

    // Pass BOTH contact and project — buildEmailContext doesn't derive the
    // contact from the project on its own, so without contact_id the name
    // vars come back empty and {{first_name}} would render literally.
    const ctx = await buildEmailContext(db, {
      contact: { contact_id: project.contact_id },
      project: { project_id: projectId },
    });
    const fallbackFirst = (project.contact_name || "there").trim().split(/\s+/)[0];
    const vars = {
      ...ctx,
      name: ctx.name || project.contact_name || "",
      first_name: ctx.first_name || fallbackFirst,
      install_date: fmtDay(project.install_date),
      appointment_date: fmtDay(project.install_date),
    };
    const subject = renderTemplate(tpl.subject, vars) || "An update on your closet project";
    const bodyText = renderTemplate(tpl.body_text || "", vars);
    const innerHtml = tpl.body_html
      ? renderTemplate(tpl.body_html, vars)
      : `<p>${(bodyText || "").replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
    const html = brandedEmail({ title: renderTemplate(tpl.name || subject, vars), body: innerHtml });

    const to = [project.contact_name ? `${project.contact_name} <${project.contact_email}>` : project.contact_email];
    const messageId = makeMessageId();

    const res = await sendEmail(env, { to, subject, html, text: bodyText, messageId });
    const failed = res?.skipped || res?.error || (res?.status && res.status >= 400);

    await logOutboundEmail(env, {
      to, subject, html, text: bodyText, messageId,
      projectId, contactId: project.contact_id, leadId: project.lead_id || null,
      templateId: tpl.id, templateKind: kind,
      status: failed ? "failed" : "sent",
      actorId: actor.id || null,
      errorCode: failed ? (res?.reason || "send_error") : null,
      errorMessage: failed ? (res?.error || "send_failed").toString().slice(0, 240) : null,
    });

    if (!failed) {
      await recordActivity(db, {
        entityType: "project", entityId: projectId, action: "stage-email-sent",
        actorKind: actor.id ? "admin" : "system", actorId: actor.id || null, actorName: actor.name || "auto-scheduler",
        details: { stage: newStatus, template_kind: kind, to: project.contact_email },
      }).catch(() => {});
    }
    return { ok: !failed, error: failed ? (res?.error || res?.reason) : null };
  } catch (e) {
    console.error("[stage-email]", String(e));
    return { ok: false, error: String(e) };
  }
}
