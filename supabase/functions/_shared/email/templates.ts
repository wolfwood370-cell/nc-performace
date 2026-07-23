// =============================================================================
// supabase/functions/_shared/email/templates.ts
// =============================================================================
// Shared NC-brand transactional email templates. Pure module: (params) →
// { subject, html } strings — no fetch, no Deno.env, no Date/Math.random —
// so two runs with the same input are byte-identical. Sending stays in the
// edge functions: this module builds content, it does no I/O.
// Visual reference: app/preview-email-brand-2026-07-19.html (Cowork lane).
// =============================================================================

// Escape user-controlled text before interpolating it into email HTML —
// coach-supplied names would otherwise allow arbitrary markup delivered from
// the verified sender domain (phishing vector). Applied to actionLink too:
// generateLink URLs carry `&` query separators that valid HTML requires as
// `&amp;` (clients decode entities in href, so the link keeps working).
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// System font stack only: no images, no webfonts (email-client compatibility).
const FONT_STACK = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif";

interface FooterCopy {
  reason: string; // first line: why the recipient is getting this email
  closing: string; // last line: the "you can ignore it" note
}

// NC-brand shell around a pre-escaped body fragment: navy header band with
// text wordmark, accent strip, white 560px card on slate background, footer.
// Table-based layout with inline styles (email-safe); full HTML document so
// lang="it" and the utf-8 charset are real, not implied.
function wrapLayout(bodyHtml: string, footer: FooterCopy): string {
  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
    <tr><td align="center" style="padding:12px 8px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#003e62;padding:22px 40px;text-align:center;">
          <div style="font-family:${FONT_STACK};font-size:17px;font-weight:800;letter-spacing:.14em;color:#ffffff;">NC TRAINING SYSTEMS</div>
        </td></tr>
        <tr><td style="background:#226fa3;height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 40px 8px;font-family:${FONT_STACK};">
${bodyHtml}
        </td></tr>
        <tr><td style="padding:18px 40px 24px;border-top:1px solid #e2e8f0;font-family:${FONT_STACK};">
          <p style="margin:0;font-size:12px;line-height:1.7;color:#94a3b8;">
            ${footer.reason}<br>
            NC Training Systems · Performance Hub<br>
            ${footer.closing}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// CTA button (navy, radius 8). `safeHref` must already be escaped.
function ctaBlock(label: string, safeHref: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 26px;">
  <tr><td style="border-radius:8px;background:#003e62;" align="center">
    <a href="${safeHref}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a>
  </td></tr>
</table>`;
}

// Boxed one-time code, monospace. `safeCode` must already be escaped.
// letter-spacing makes the digits readable at a glance; the box is a
// table (not a <div>) because Outlook drops padding/background on divs.
function codeBlock(safeCode: string): string {
  return `<p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#64748b;">Oppure inserisci questo codice nell'app:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 26px;">
  <tr><td style="border-radius:8px;background:#f1f5f9;border:1px solid #e2e8f0;padding:12px 26px;" align="center">
    <span style="font-family:Consolas,'Courier New',monospace;font-size:26px;font-weight:700;letter-spacing:.28em;color:#0f172a;">${safeCode}</span>
  </td></tr>
</table>`;
}

// Plain-link fallback under the CTA. `safeHref` must already be escaped.
function fallbackBlock(safeHref: string): string {
  return `<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#64748b;">Oppure copia e incolla questo link nel browser:</p>
<p style="margin:0 0 26px;font-size:12px;color:#64748b;word-break:break-all;"><a href="${safeHref}" style="color:#226fa3;">${safeHref}</a></p>`;
}

export interface InviteEmailParams {
  firstName: string;
  actionLink: string;
}

// Athlete invite email. `firstName` is required (the edge function 400s on a
// missing name before ever building the email). The subject is a plain-text
// mail header, NOT an HTML context: it stays unescaped by design — escaping
// would corrupt names like D'Angelo into D&#39;Angelo. CONTRACT: callers must
// strip control chars (CR/LF included) from firstName BEFORE calling — the
// header-injection guard lives in the caller (invite-athlete's
// sanitizeNameField), not here.
export function inviteEmail({ firstName, actionLink }: InviteEmailParams): {
  subject: string;
  html: string;
} {
  const safeName = escapeHtml(firstName);
  const safeLink = escapeHtml(actionLink);
  const body = `<h1 style="margin:0 0 14px;font-size:20px;font-weight:700;color:#0f172a;">Ciao ${safeName},</h1>
<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#334155;">
  il tuo coach ti ha invitato su <strong>NC Performance Hub</strong>, la piattaforma per il tuo percorso di allenamento. Attiva il tuo account con il pulsante qui sotto.
</p>
${ctaBlock("Accetta l'invito", safeLink)}
${fallbackBlock(safeLink)}`;
  return {
    subject: `${firstName}, il tuo coach ti ha invitato su NC Performance Hub`,
    html: wrapLayout(body, {
      reason: "Ricevi questa email perché un coach ti ha invitato sulla piattaforma.",
      closing: "Se non ti aspettavi questa email, puoi ignorarla.",
    }),
  };
}

export interface RecoveryEmailParams {
  actionLink: string;
}

// Password recovery email. No user-supplied text beyond the action link.
export function recoveryEmail({ actionLink }: RecoveryEmailParams): {
  subject: string;
  html: string;
} {
  const safeLink = escapeHtml(actionLink);
  const body = `<h1 style="margin:0 0 14px;font-size:20px;font-weight:700;color:#0f172a;">Reimposta la tua password</h1>
<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#334155;">
  Abbiamo ricevuto una richiesta di reimpostazione della password del tuo account. Creane una nuova con il pulsante qui sotto — il link scade a breve.
</p>
${ctaBlock("Reimposta password", safeLink)}
${fallbackBlock(safeLink)}`;
  return {
    subject: "Reimposta la tua password — NC Performance Hub",
    html: wrapLayout(body, {
      reason:
        "Ricevi questa email perché è stato richiesto un recupero password per questo indirizzo.",
      closing: "Se non l'hai richiesta tu, puoi ignorarla in tutta sicurezza.",
    }),
  };
}

export interface LoginLinkEmailParams {
  actionLink: string;
  /**
   * The one-time code (`properties.email_otp` of generateLink). Its LENGTH is
   * a project setting (GoTrue allows 6 to 10 digits) — this project issues 8,
   * verified live on 2026-07-22. Nothing here depends on the count: the
   * template renders whatever it is given, and the client must accept the
   * whole range rather than pin a number that a dashboard change would break.
   */
  code: string;
}

// Passwordless sign-in email: one CTA link AND the equivalent one-time code —
// same underlying token, so using either consumes the other. No password is
// ever mentioned or transported. The code stays OUT of the subject on purpose:
// notification previews would put it on a locked screen.
export function loginLinkEmail({ actionLink, code }: LoginLinkEmailParams): {
  subject: string;
  html: string;
} {
  const safeLink = escapeHtml(actionLink);
  const safeCode = escapeHtml(code);
  const body = `<h1 style="margin:0 0 14px;font-size:20px;font-weight:700;color:#0f172a;">Accedi a NC Performance Hub</h1>
<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#334155;">
  Hai richiesto di accedere al tuo account. Entra con il pulsante qui sotto: link e codice valgono una sola volta e scadono a breve.
</p>
${ctaBlock("Accedi", safeLink)}
${codeBlock(safeCode)}
${fallbackBlock(safeLink)}`;
  return {
    subject: "Il tuo accesso a NC Performance Hub",
    html: wrapLayout(body, {
      reason: "Ricevi questa email perché è stato richiesto un accesso per questo indirizzo.",
      closing: "Se non l'hai richiesto tu, puoi ignorarla in tutta sicurezza.",
    }),
  };
}
