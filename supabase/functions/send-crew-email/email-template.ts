export type BrandedEmailOptions = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  contentHtml?: string;
  code?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  footerNote?: string;
};

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]!));

export function brandedEmail(options: BrandedEmailOptions): string {
  const title = esc(options.title);
  const subtitle = options.subtitle ? esc(options.subtitle) : "";
  const code = options.code ? `
    <tr><td align="center" style="padding:24px 16px 20px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:clamp(36px,8vw,54px);line-height:1.1;font-weight:800;letter-spacing:8px;color:#ff8b45;text-shadow:0 0 18px #ff873f99;white-space:nowrap;">${esc(options.code)}</div>
      <div style="margin-top:12px;color:#c7c4cb;font-size:13px;line-height:1.4;">Valid for 10 minutes</div>
    </td></tr>` : "";
  const button = options.buttonLabel && options.buttonUrl ? `
    <tr><td align="left" style="padding:8px 20px 22px;">
      <a href="${esc(options.buttonUrl)}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#ff7a32;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;text-decoration:none;">${esc(options.buttonLabel)}</a>
    </td></tr>` : "";
  const note = options.footerNote ? esc(options.footerNote) : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${title} - Kinetic Crew</title>
<style>
@keyframes kcGlowShift{0%{background-position:0% 50%;text-shadow:0 0 8px #ff7a3266,0 0 18px #ff7a3244}50%{background-position:100% 50%;text-shadow:0 0 14px #ff9b4d99,0 0 28px #ff6b3566}100%{background-position:0% 50%;text-shadow:0 0 8px #ff7a3266,0 0 18px #ff7a3244}}
.kc-wordmark{display:inline-block;background-image:linear-gradient(100deg,#ff7735 0%,#ffd18a 32%,#ff8b43 58%,#ff5e36 82%,#ffb76a 100%);background-size:220% 220%;background-position:0% 50%;-webkit-background-clip:text;background-clip:text;color:#ff8b45!important;-webkit-text-fill-color:transparent;animation:kcGlowShift 5s ease-in-out infinite}
@media(prefers-reduced-motion:reduce){.kc-wordmark{animation:none}}
</style></head>
<body style="margin:0;padding:28px 12px;background:#111214;color:#f6f4f1;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${subtitle || title} - Kinetic Crew</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#111214;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;">
<tr><td style="padding:8px 20px 24px;">
<div class="kc-wordmark" style="font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.2;font-weight:900;letter-spacing:3px;color:#ff8b45;text-shadow:0 0 14px #ff7a3266;">KINETIC CREW</div>
</td></tr>
<tr><td style="border:1px solid #ffffff1c;border-radius:24px;background:#202124;background-image:linear-gradient(145deg,#26272a 0%,#1a1b1e 58%,#251d19 100%);box-shadow:0 14px 38px #0006;overflow:hidden;">
<div style="height:3px;background:linear-gradient(90deg,#ff6b2d,#ffc078,#ff6b2d);"></div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td style="padding:26px 22px 8px;">
<h1 style="margin:0;color:#ffffff;font-size:clamp(27px,6vw,36px);line-height:1.12;font-weight:800;letter-spacing:-1px;">${title}</h1>
${subtitle ? `<p style="margin:10px 0 0;color:#bdbbc0;font-size:15px;line-height:1.55;">${subtitle}</p>` : ""}
</td></tr>
${options.contentHtml ? `<tr><td style="padding:12px 22px 18px;color:#e8e6e3;font-size:14px;line-height:1.65;">${options.contentHtml}</td></tr>` : ""}
${code}
${button}
</table></td></tr>
<tr><td style="padding:18px 20px 0;">
${note ? `<p style="margin:0 0 12px;color:#929196;font-size:12px;line-height:1.5;">${note}</p>` : ""}
<div class="kc-wordmark" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:800;letter-spacing:2px;color:#ff8b45;text-shadow:0 0 12px #ff7a3266;">KINETIC CREW</div>
</td></tr>
</table></td></tr></table></body></html>`;
}
