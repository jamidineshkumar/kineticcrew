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

const BRAND_LOGO = "https://lkdfjiweqxshbbcadfna.supabase.co/storage/v1/object/public/crew-brand-assets/brand/email-logo.png";
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]!));

export function brandedEmail(options: BrandedEmailOptions): string {
  const title = esc(options.title);
  const subtitle = options.subtitle ? esc(options.subtitle) : "";
  const code = options.code ? `
    <tr><td align="center" style="padding:28px 14px 18px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:clamp(40px,9vw,64px);line-height:1.2;font-weight:800;letter-spacing:clamp(5px,2vw,13px);color:#ff955d;text-shadow:0 0 16px #f4773f88;white-space:nowrap;">${esc(options.code)}</div>
      <div style="display:inline-block;margin-top:14px;padding:7px 14px;border:1px solid #77747e;border-radius:30px;background:#35353d;color:#c3c1c9;font-size:14px;">Valid for 10 minutes</div>
    </td></tr>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${title} · Kinetic Crew</title></head>
<body style="margin:0;padding:0;background:#08090d;color:#f5f3f6;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${subtitle || title} · Kinetic Crew</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#08090d;"><tr><td align="center" style="padding:24px 12px 30px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;">
<tr><td style="padding:4px 8px 18px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td align="center" valign="middle" colspan="2"><img src="${BRAND_LOGO}" width="66" height="66" alt="KC" style="display:block;width:66px;height:66px;object-fit:contain;border:1px solid #66616e;border-radius:22px;background:linear-gradient(145deg,#44434d,#171820);box-shadow:0 0 22px #ffffff18;padding:4px;"></td>
</tr></table></td></tr>
<tr><td style="padding:0 8px 16px;">
<h1 style="margin:0;font-size:clamp(36px,8vw,52px);line-height:1.03;font-weight:800;letter-spacing:-2px;color:#f7f6f8;">${title}</h1>
${subtitle ? `<p style="margin:22px 0 0;color:#b6b3bd;font-size:20px;line-height:1.55;">${subtitle}</p>` : ""}
</td></tr>
<tr><td style="padding:0 0 16px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #9d7774;border-radius:30px;background:#292832;background-image:linear-gradient(135deg,#343640 0%,#25242d 52%,#302421 100%);box-shadow:0 0 24px #f18a5830,inset 0 1px 0 #ffffff38;">
${options.contentHtml ? `<tr><td style="padding:24px 20px 8px;color:#e9e6ed;font-size:16px;line-height:1.65;">${options.contentHtml}</td></tr>` : ""}
${code}
</table></td></tr>
<tr><td style="padding:0 10px;"><p style="margin:0;color:#aaa7b0;font-size:15px;line-height:1.6;">${esc(options.footerNote || "If you didn't request this, you can safely ignore this email.")}</p>
<p style="margin:26px 0 0;color:#686671;font-size:10px;letter-spacing:2px;">KINETIC CREW</p></td></tr>
</table></td></tr></table></body></html>`;
}
