export const metadata = { title: "Privacy Policy - The Jose Show" };

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16 text-sm text-neutral-300">
      <h1 className="text-2xl font-bold text-white mb-8">Privacy Policy</h1>
      <p className="text-neutral-400 mb-6">Last updated: March 9, 2026</p>

      <section className="space-y-4">
        <p>
          The Jose Show (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) operates the website at
          thejoseshow.vercel.app (the &quot;Service&quot;). This Privacy Policy explains what information we
          collect and how we use it.
        </p>

        <h2 className="text-lg font-semibold text-white pt-4">1. Information We Collect</h2>
        <p>
          When you connect a third-party platform (TikTok, Meta, Google/YouTube), we store OAuth
          access tokens and refresh tokens to maintain your connection. We also retrieve basic
          profile information (username, profile ID) and video analytics data (views, likes, shares).
        </p>

        <h2 className="text-lg font-semibold text-white pt-4">2. How We Use Your Information</h2>
        <p>
          We use your information solely to provide the Service: publishing content to your connected
          social media accounts and displaying analytics in your dashboard. We do not sell, share, or
          distribute your information to third parties.
        </p>

        <h2 className="text-lg font-semibold text-white pt-4">3. Data Storage</h2>
        <p>
          Your data is stored securely in our database hosted on Supabase. OAuth tokens are encrypted
          at rest. We retain your data only as long as your account is active.
        </p>

        <h2 className="text-lg font-semibold text-white pt-4">4. Third-Party Services</h2>
        <p>
          The Service integrates with TikTok, Meta (Facebook/Instagram), and Google (YouTube) APIs.
          Your use of those platforms is governed by their respective privacy policies. You can
          revoke access at any time from the Settings page or directly from each platform.
        </p>

        <h2 className="text-lg font-semibold text-white pt-4">5. Data Deletion</h2>
        <p>
          You may disconnect any platform at any time, which removes stored tokens. To request full
          deletion of your data, contact us at thejoseshow on social media.
        </p>

        <h2 className="text-lg font-semibold text-white pt-4">6. Changes</h2>
        <p>
          We may update this Privacy Policy from time to time. Continued use of the Service after
          changes constitutes acceptance of the updated policy.
        </p>

        <h2 className="text-lg font-semibold text-white pt-4">7. Contact</h2>
        <p>
          For privacy-related questions, contact us at thejoseshow on social media.
        </p>
      </section>
    </main>
  );
}
