export const metadata = { title: "Terms of Service - The Jose Show" };

export default function TermsPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16 text-sm text-neutral-300">
      <h1 className="text-2xl font-bold text-white mb-8">Terms of Service</h1>
      <p className="text-neutral-400 mb-6">Last updated: March 9, 2026</p>

      <section className="space-y-4">
        <p>
          Welcome to The Jose Show (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). By accessing or using
          our website at thejoseshow.vercel.app (the &quot;Service&quot;), you agree to be bound by these
          Terms of Service.
        </p>

        <h2 className="text-lg font-semibold text-white pt-4">1. Use of Service</h2>
        <p>
          The Service is a content management dashboard for The Jose Show entertainment brand. It is
          intended for authorized users to manage and publish social media content across platforms
          including YouTube, Facebook, Instagram, and TikTok.
        </p>

        <h2 className="text-lg font-semibold text-white pt-4">2. Third-Party Integrations</h2>
        <p>
          The Service connects to third-party platforms (TikTok, Meta, Google/YouTube) via their
          official APIs. By connecting your accounts, you authorize us to publish content and retrieve
          analytics data on your behalf. You may disconnect any platform at any time from the Settings
          page.
        </p>

        <h2 className="text-lg font-semibold text-white pt-4">3. Content Ownership</h2>
        <p>
          You retain full ownership of all content you create and publish through the Service. We do
          not claim any rights to your videos, captions, or other creative works.
        </p>

        <h2 className="text-lg font-semibold text-white pt-4">4. Limitation of Liability</h2>
        <p>
          The Service is provided &quot;as is&quot; without warranties of any kind. We are not liable for any
          damages arising from the use of the Service, including but not limited to content
          publishing errors, platform API changes, or service interruptions.
        </p>

        <h2 className="text-lg font-semibold text-white pt-4">5. Changes</h2>
        <p>
          We reserve the right to modify these terms at any time. Continued use of the Service after
          changes constitutes acceptance of the updated terms.
        </p>

        <h2 className="text-lg font-semibold text-white pt-4">6. Contact</h2>
        <p>
          For questions about these terms, contact us at thejoseshow on social media.
        </p>
      </section>
    </main>
  );
}
