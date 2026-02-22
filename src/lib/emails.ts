const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = 'ArchonHQ <onboarding@archonhq.ai>';

interface SendProvisioningEmailParams {
  tenantEmail: string;
  plan: 'strategos' | 'archon' | 'free';
  vpsIp?: string;
  tenantName?: string;
}

export async function sendProvisioningEmail(params: SendProvisioningEmailParams): Promise<void> {
  const { tenantEmail, plan, vpsIp, tenantName } = params;

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured, skipping email');
    return;
  }

  let subject: string;
  let htmlBody: string;

  if (plan === 'strategos' || plan === 'archon') {
    // Paid tier - VPS provisioned
    const planName = plan === 'archon' ? 'Archon' : 'Strategos';
    subject = `Your OpenClaw gateway is ready 🚀`;

    htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .ip-box { background: #1a1a1a; color: #00ff00; font-family: 'Courier New', monospace; padding: 15px; border-radius: 4px; font-size: 18px; margin: 20px 0; }
    .cta-button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Welcome to ${planName}!</h1>
      <p>Your dedicated OpenClaw gateway is live and ready to command your AI team.</p>
    </div>
    <div class="content">
      <p>Hi ${tenantName || 'there'},</p>

      <p>Great news! Your <strong>${planName}</strong> tier VPS has been provisioned and is ready to connect.</p>

      <h3>Your Gateway IP Address:</h3>
      <div class="ip-box">${vpsIp || 'Pending...'}</div>

      <h3>Next Steps:</h3>
      <ol>
        <li><strong>Connect to your dashboard:</strong> Visit <a href="https://archonhq.ai/dashboard/connect">ArchonHQ Dashboard</a></li>
        <li><strong>Add your gateway:</strong> Use the IP above to connect your provisioned gateway</li>
        <li><strong>Deploy your agents:</strong> Start commanding your AI team from the ArchonHQ control center</li>
      </ol>

      <a href="https://archonhq.ai/docs" class="cta-button">📖 Read the Docs</a>

      <h3>Need Help?</h3>
      <p>Check out our documentation at <a href="https://archonhq.ai/docs">archonhq.ai/docs</a> or reach out to our support team.</p>

      <p>Welcome to the future of AI orchestration!</p>

      <p>— The ArchonHQ Team</p>
    </div>
    <div class="footer">
      <p>ArchonHQ | Command Your AI Army</p>
      <p><a href="https://archonhq.ai/unsubscribe">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>
    `;
  } else {
    // Free tier - self-connect guide
    subject = `Welcome to ArchonHQ — connect your OpenClaw`;

    htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .code-box { background: #1a1a1a; color: #00ff00; font-family: 'Courier New', monospace; padding: 15px; border-radius: 4px; margin: 20px 0; }
    .cta-button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>👋 Welcome to ArchonHQ!</h1>
      <p>Let's get your OpenClaw gateway connected.</p>
    </div>
    <div class="content">
      <p>Hi ${tenantName || 'there'},</p>

      <p>Thanks for joining ArchonHQ! You're on the <strong>Initiate (Free)</strong> tier, which means you'll connect your own OpenClaw gateway.</p>

      <h3>Quick Start Guide:</h3>

      <h4>1. Install OpenClaw</h4>
      <div class="code-box">npm install -g openclaw<br>openclaw init</div>

      <h4>2. Start Your Gateway</h4>
      <div class="code-box">openclaw gateway start</div>

      <h4>3. Connect to ArchonHQ</h4>
      <p>Visit your <a href="https://archonhq.ai/dashboard/connect">dashboard</a> and add your local gateway URL (usually <code>http://localhost:18789</code>).</p>

      <a href="https://openclaw.ai" class="cta-button">🔗 Visit OpenClaw.ai</a>
      <a href="https://archonhq.ai/docs" class="cta-button">📖 Read the Docs</a>

      <h3>Want a Managed Gateway?</h3>
      <p>Upgrade to <strong>Strategos</strong> or <strong>Archon</strong> to get a fully provisioned VPS with automatic setup.</p>
      <p><a href="https://archonhq.ai/dashboard/billing">View Plans</a></p>

      <p>Happy building!</p>

      <p>— The ArchonHQ Team</p>
    </div>
    <div class="footer">
      <p>ArchonHQ | Command Your AI Army</p>
      <p><a href="https://archonhq.ai/unsubscribe">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>
    `;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [tenantEmail],
        subject,
        html: htmlBody,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log(`Email sent successfully to ${tenantEmail}, ID: ${data.id}`);
  } catch (error) {
    console.error('Failed to send provisioning email:', error);
    throw error;
  }
}
