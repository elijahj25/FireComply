// ============================================================
//  FireComply — Overdue Notification Edge Function
//  File: supabase/functions/notify-overdue/index.ts
//
//  Runs on a cron schedule (daily) via Supabase Cron Jobs.
//  Sends email alerts for overdue and soon-due locations.
//
//  Setup:
//  1. Deploy: supabase functions deploy notify-overdue
//  2. Set secrets:
//       supabase secrets set RESEND_API_KEY=re_xxxx
//       supabase secrets set APP_URL=https://yourdomain.com
//  3. Schedule (Supabase Dashboard → Edge Functions → Schedules):
//       Cron: 0 9 * * *   (9am UTC daily)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL        = Deno.env.get("APP_URL") ?? "https://yourdomain.com";
const FROM_EMAIL     = "alerts@firecomploy.com"; // Update to your verified Resend domain

// ─── EMAIL TEMPLATES ──────────────────────────────────────────

function overdueEmail(location: any, daysOverdue: number): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Overdue Service Alert</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#e74c3c;padding:28px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:28px;">🔥</span>
                    <span style="font-family:Georgia,serif;font-size:22px;font-weight:900;color:#fff;margin-left:10px;vertical-align:middle;">FireComply</span>
                  </td>
                  <td align="right">
                    <span style="background:rgba(255,255,255,0.2);color:#fff;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;">⚠️ OVERDUE ALERT</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 8px;font-size:22px;color:#111;letter-spacing:-0.02em;">Service Overdue</h2>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
                A kitchen exhaust system service is overdue and requires immediate scheduling.
              </p>

              <!-- Alert box -->
              <div style="background:#fee2e2;border-left:4px solid #dc2626;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
                <div style="font-size:12px;color:#dc2626;font-weight:700;letter-spacing:0.05em;margin-bottom:4px;">OVERDUE BY ${daysOverdue} DAY${daysOverdue !== 1 ? "S" : ""}</div>
                <div style="font-size:18px;font-weight:800;color:#111;">${location.name}</div>
                <div style="color:#6b7280;font-size:14px;margin-top:2px;">${location.address ?? ""}</div>
              </div>

              <!-- Details grid -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td width="50%" style="padding:0 8px 0 0;vertical-align:top;">
                    <div style="background:#f9fafb;border-radius:8px;padding:14px;">
                      <div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Last Serviced</div>
                      <div style="font-size:15px;font-weight:700;color:#111;">${location.last_service_date ? new Date(location.last_service_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Never"}</div>
                    </div>
                  </td>
                  <td width="50%" style="padding:0 0 0 8px;vertical-align:top;">
                    <div style="background:#fee2e2;border-radius:8px;padding:14px;">
                      <div style="font-size:11px;color:#dc2626;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Was Due</div>
                      <div style="font-size:15px;font-weight:700;color:#dc2626;">${location.next_due_date ? new Date(location.next_due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</div>
                    </div>
                  </td>
                </tr>
              </table>

              ${location.open_issues_count > 0 ? `
              <div style="background:#fef3c7;border-radius:8px;padding:12px 16px;margin-bottom:24px;display:flex;align-items:center;gap:10px;">
                <span style="font-size:18px;">⚠️</span>
                <div>
                  <span style="font-weight:700;color:#92400e;">${location.open_issues_count} open issue${location.open_issues_count !== 1 ? "s" : ""}</span>
                  <span style="color:#92400e;font-size:14px;"> also require attention at this location.</span>
                </div>
              </div>` : ""}

              <!-- CTA -->
              <a href="${APP_URL}" style="display:block;background:#e74c3c;color:#fff;text-decoration:none;text-align:center;border-radius:12px;padding:16px;font-size:16px;font-weight:700;margin-bottom:24px;">
                View Compliance Dashboard →
              </a>

              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;text-align:center;">
                This alert was sent because ${location.name} has not been serviced within the required 90-day period.<br>
                Commercial kitchen exhaust systems must be maintained per NFPA 96 standards.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #f0f0f0;padding:16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:11px;color:#9ca3af;">🔥 FireComply · Compliance Monitoring</td>
                  <td align="right" style="font-size:11px;color:#9ca3af;">
                    <a href="${APP_URL}/unsubscribe" style="color:#9ca3af;text-decoration:none;">Unsubscribe</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function upcomingEmail(location: any, daysUntil: number): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 8px rgba(0,0,0,0.08);">

          <tr>
            <td style="background:#111;padding:28px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:28px;">🔥</span>
                    <span style="font-family:Georgia,serif;font-size:22px;font-weight:900;color:#fff;margin-left:10px;vertical-align:middle;">FireComply</span>
                  </td>
                  <td align="right">
                    <span style="background:#fef3c7;color:#92400e;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;">📅 SERVICE REMINDER</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 8px;font-size:22px;color:#111;">Service Due in ${daysUntil} Day${daysUntil !== 1 ? "s" : ""}</h2>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">Time to schedule your next kitchen exhaust inspection and cleaning.</p>

              <div style="background:#fef3c7;border-left:4px solid #d97706;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
                <div style="font-size:12px;color:#d97706;font-weight:700;letter-spacing:0.05em;margin-bottom:4px;">DUE IN ${daysUntil} DAYS</div>
                <div style="font-size:18px;font-weight:800;color:#111;">${location.name}</div>
                <div style="color:#6b7280;font-size:14px;margin-top:2px;">${location.address ?? ""}</div>
              </div>

              <div style="background:#f9fafb;border-radius:8px;padding:14px 16px;margin-bottom:24px;">
                <div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Service Due Date</div>
                <div style="font-size:20px;font-weight:800;color:#d97706;">${location.next_due_date ? new Date(location.next_due_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—"}</div>
              </div>

              <a href="${APP_URL}" style="display:block;background:#111;color:#fff;text-decoration:none;text-align:center;border-radius:12px;padding:16px;font-size:16px;font-weight:700;margin-bottom:24px;">
                View Dashboard →
              </a>
            </td>
          </tr>

          <tr>
            <td style="background:#f9fafb;border-top:1px solid #f0f0f0;padding:16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:11px;color:#9ca3af;">🔥 FireComply · Compliance Monitoring</td>
                  <td align="right" style="font-size:11px;color:#9ca3af;"><a href="${APP_URL}/unsubscribe" style="color:#9ca3af;text-decoration:none;">Unsubscribe</a></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── SEND EMAIL VIA RESEND ────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Resend error: ${JSON.stringify(data)}`);
  return data;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────

serve(async (req) => {
  // Allow manual trigger via POST, or cron invocation
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_KEY);
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const results: any[] = [];

  try {
    // ── 1. Find OVERDUE locations ─────────────────────────────
    const { data: overdueLocations, error: e1 } = await db
      .from("locations")
      .select("*, location_users(user_id, profiles(email, full_name))")
      .lt("next_due_date", todayStr)
      .neq("compliance_status", "compliant");

    if (e1) throw e1;

    for (const loc of overdueLocations ?? []) {
      const daysOverdue = Math.ceil(
        (today.getTime() - new Date(loc.next_due_date).getTime()) / 86400000
      );

      // Update compliance status to overdue
      await db.from("locations")
        .update({ compliance_status: "overdue", updated_at: new Date().toISOString() })
        .eq("id", loc.id);

      // Notify restaurant contacts
      const contacts = (loc.location_users ?? [])
        .map((lu: any) => lu.profiles)
        .filter(Boolean);

      for (const contact of contacts) {
        if (!contact.email) continue;
        try {
          await sendEmail(
            contact.email,
            `⚠️ Overdue Service Alert — ${loc.name}`,
            overdueEmail(loc, daysOverdue)
          );
          results.push({ type: "overdue", location: loc.name, email: contact.email, status: "sent" });
        } catch (err) {
          results.push({ type: "overdue", location: loc.name, email: contact.email, status: "failed", error: String(err) });
        }
      }
    }

    // ── 2. Find UPCOMING locations (due in 7 or 14 days) ─────
    const in7  = new Date(today); in7.setDate(today.getDate() + 7);
    const in14 = new Date(today); in14.setDate(today.getDate() + 14);

    const { data: upcomingLocations, error: e2 } = await db
      .from("locations")
      .select("*, location_users(user_id, profiles(email, full_name))")
      .or(`next_due_date.eq.${in7.toISOString().split("T")[0]},next_due_date.eq.${in14.toISOString().split("T")[0]}`);

    if (e2) throw e2;

    for (const loc of upcomingLocations ?? []) {
      const dueDate = new Date(loc.next_due_date);
      const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);

      const contacts = (loc.location_users ?? [])
        .map((lu: any) => lu.profiles)
        .filter(Boolean);

      for (const contact of contacts) {
        if (!contact.email) continue;
        try {
          await sendEmail(
            contact.email,
            `📅 Service Reminder — ${loc.name} (due in ${daysUntil} days)`,
            upcomingEmail(loc, daysUntil)
          );
          results.push({ type: "upcoming", location: loc.name, email: contact.email, daysUntil, status: "sent" });
        } catch (err) {
          results.push({ type: "upcoming", location: loc.name, email: contact.email, status: "failed", error: String(err) });
        }
      }
    }

    // ── 3. Also notify admins of all overdue locations ────────
    const { data: admins } = await db
      .from("profiles")
      .select("email")
      .eq("role", "admin");

    if ((overdueLocations?.length ?? 0) > 0 && admins?.length) {
      const overdueList = (overdueLocations ?? [])
        .map((l: any) => `• ${l.name} — ${Math.ceil((today.getTime() - new Date(l.next_due_date).getTime()) / 86400000)}d overdue`)
        .join("<br>");

      const adminHtml = `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;">
          <div style="background:#111;border-radius:12px;padding:24px;color:#fff;margin-bottom:20px;">
            <div style="font-size:24px;margin-bottom:8px;">🔥 FireComply</div>
            <div style="font-size:18px;font-weight:700;">Daily Overdue Summary</div>
            <div style="color:#9ca3af;font-size:14px;">${todayStr}</div>
          </div>
          <div style="background:#fee2e2;border-radius:12px;padding:20px;margin-bottom:20px;">
            <div style="font-size:14px;font-weight:700;color:#dc2626;margin-bottom:12px;">
              ${overdueLocations?.length} Location${(overdueLocations?.length ?? 0) !== 1 ? "s" : ""} Overdue
            </div>
            <div style="color:#374151;font-size:14px;line-height:2;">${overdueList}</div>
          </div>
          <a href="${APP_URL}" style="display:block;background:#e74c3c;color:#fff;text-decoration:none;text-align:center;border-radius:10px;padding:14px;font-size:15px;font-weight:700;">
            View Admin Dashboard →
          </a>
        </div>`;

      for (const admin of admins) {
        if (!admin.email) continue;
        try {
          await sendEmail(
            admin.email,
            `🔥 FireComply Daily Summary — ${overdueLocations?.length} Overdue`,
            adminHtml
          );
          results.push({ type: "admin-summary", email: admin.email, status: "sent" });
        } catch (err) {
          results.push({ type: "admin-summary", email: admin.email, status: "failed" });
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("notify-overdue error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
