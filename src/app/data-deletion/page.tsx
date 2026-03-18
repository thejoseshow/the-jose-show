import Link from "next/link";
import { SITE_NAME } from "@/lib/constants";

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-6 py-20">
        <h1 className="text-3xl font-bold mb-8">Data Deletion Request</h1>

        <div className="space-y-6 text-gray-300 leading-relaxed">
          <p>
            {SITE_NAME} respects your privacy. If you would like to request deletion
            of any data associated with your account or interactions with our app,
            please follow the steps below.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">How to Request Data Deletion</h2>
          <ol className="list-decimal list-inside space-y-3">
            <li>
              Send an email to{" "}
              <a href="mailto:jose@thejoseshow.com" className="text-red-400 hover:text-red-300 underline">
                jose@thejoseshow.com
              </a>{" "}
              with the subject line &quot;Data Deletion Request&quot;.
            </li>
            <li>
              Include the email address or username associated with your account.
            </li>
            <li>
              We will process your request and delete your data within 30 days.
            </li>
          </ol>

          <h2 className="text-xl font-semibold text-white mt-8">What Data We Store</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>Basic account information (name, email) if you connected via TikTok or other platforms</li>
            <li>Content publishing metadata (post IDs, timestamps)</li>
            <li>Analytics data (view counts, engagement metrics)</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">What Happens After Deletion</h2>
          <p>
            Once your data is deleted, all associated records will be permanently
            removed from our systems. This action cannot be undone. Published content
            on third-party platforms (TikTok, YouTube, etc.) is managed separately
            through those platforms.
          </p>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            &larr; Back to {SITE_NAME}
          </Link>
        </div>
      </div>
    </div>
  );
}
