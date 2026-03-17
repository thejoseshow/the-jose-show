import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export async function notifyContentReady(contentCount: number) {
  const to = process.env.NOTIFICATION_EMAIL;
  if (!to) return;

  await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL || "noreply@thejoseshow.com",
    to,
    subject: `🎬 ${contentCount} new content ready for review`,
    html: `
      <h2>New Content Ready!</h2>
      <p>${contentCount} piece${contentCount > 1 ? "s" : ""} of content ${contentCount > 1 ? "are" : "is"} ready for your review.</p>
      <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/content?status=review" style="background:#e11d48;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">Review Now</a></p>
      <p style="color:#666;font-size:14px;">- The Jose Show Automation</p>
    `,
  });
}

export async function notifyPipelineError(videoFilename: string, error: string) {
  const to = process.env.NOTIFICATION_EMAIL;
  if (!to) return;

  await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL || "noreply@thejoseshow.com",
    to,
    subject: `⚠️ Pipeline error: ${videoFilename}`,
    html: `
      <h2>Pipeline Error</h2>
      <p>Failed to process: <strong>${videoFilename}</strong></p>
      <p style="color:#dc2626;background:#fef2f2;padding:12px;border-radius:8px;font-family:monospace;">${error}</p>
      <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/uploads">View Pipeline Status</a></p>
    `,
  });
}

export async function notifyPublishPartialFailure(
  title: string,
  failedPlatforms: string[]
) {
  const to = process.env.NOTIFICATION_EMAIL;
  if (!to) return;

  await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL || "noreply@thejoseshow.com",
    to,
    subject: `\u26a0\ufe0f Partial publish failure: ${title}`,
    html: `
      <h2>Partial Publish Failure</h2>
      <p><strong>${title}</strong> failed to publish to: ${failedPlatforms.join(", ")}</p>
      <p>Other platforms were published successfully. You can retry the failed platforms from the dashboard.</p>
      <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/content" style="background:#e11d48;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">View in Dashboard</a></p>
    `,
  });
}

export async function notifyWeeklyDigest(insights: {
  top_insights: string[];
  content_type_rankings: Array<{ type: string; avg_engagement: number }>;
  platform_rankings: Array<{ platform: string; total_views: number; avg_engagement: number }>;
  suggested_content_ideas: string[];
  week_summary: string;
}) {
  const to = process.env.NOTIFICATION_EMAIL;
  if (!to) return;

  const totalViews = insights.platform_rankings.reduce((s, p) => s + p.total_views, 0);

  const insightsBullets = insights.top_insights
    .map((i) => `<li style="margin-bottom:6px;">${i}</li>`)
    .join("");
  const ideasBullets = insights.suggested_content_ideas
    .map((i) => `<li style="margin-bottom:6px;">${i}</li>`)
    .join("");
  const platformRows = insights.platform_rankings
    .map(
      (p) =>
        `<tr><td style="padding:4px 12px;text-transform:capitalize;">${p.platform}</td><td style="padding:4px 12px;text-align:right;">${p.total_views.toLocaleString()}</td><td style="padding:4px 12px;text-align:right;">${p.avg_engagement.toFixed(1)}%</td></tr>`
    )
    .join("");

  await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL || "noreply@thejoseshow.com",
    to,
    subject: `Weekly Digest: ${totalViews.toLocaleString()} views this week`,
    html: `
      <h2>The Jose Show — Weekly Performance</h2>
      <p>${insights.week_summary}</p>
      <h3>Top Insights</h3>
      <ul>${insightsBullets}</ul>
      ${platformRows ? `<h3>Platform Breakdown</h3><table style="border-collapse:collapse;width:100%;"><thead><tr><th style="text-align:left;padding:4px 12px;">Platform</th><th style="text-align:right;padding:4px 12px;">Views</th><th style="text-align:right;padding:4px 12px;">Engagement</th></tr></thead><tbody>${platformRows}</tbody></table>` : ""}
      ${ideasBullets ? `<h3>Content Ideas</h3><ul>${ideasBullets}</ul>` : ""}
      <p style="margin-top:20px;"><a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/analytics" style="background:#e11d48;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">View Full Analytics</a></p>
      <p style="color:#666;font-size:14px;">- The Jose Show AI Coach</p>
    `,
  });
}

export async function notifyPublishSuccess(
  title: string,
  platforms: string[]
) {
  const to = process.env.NOTIFICATION_EMAIL;
  if (!to) return;

  await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL || "noreply@thejoseshow.com",
    to,
    subject: `✅ Published: ${title}`,
    html: `
      <h2>Content Published!</h2>
      <p><strong>${title}</strong> has been published to: ${platforms.join(", ")}</p>
      <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/content">View in Dashboard</a></p>
    `,
  });
}
