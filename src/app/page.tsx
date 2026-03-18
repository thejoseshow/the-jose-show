import Link from "next/link";
import { SOCIAL_LINKS, SITE_NAME } from "@/lib/constants";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-red-900/30 via-black to-purple-900/20" />
        <div className="relative max-w-4xl mx-auto px-6 py-24 text-center">
          <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight">
            {SITE_NAME}
          </h1>
          <p className="mt-6 text-xl sm:text-2xl text-gray-300 max-w-2xl mx-auto">
            Dominican culture. Bachata. Events. Content. Dale!
          </p>
          <div className="mt-10 flex justify-center gap-4 flex-wrap">
            <SocialLink href={SOCIAL_LINKS.youtube} label="YouTube" />
            <SocialLink href={SOCIAL_LINKS.instagram} label="Instagram" />
            <SocialLink href={SOCIAL_LINKS.facebook} label="Facebook" />
            <SocialLink href={SOCIAL_LINKS.tiktok} label="TikTok" />
          </div>
        </div>
      </header>

      {/* About */}
      <section className="max-w-3xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold mb-6">About Jose</h2>
        <div className="space-y-4 text-gray-300 leading-relaxed">
          <p>
            Jose is a Dominican dancer, DJ, event host, and content creator based in South Florida.
            Originally from the Dominican Republic and raised in the Bronx, he brings Dominican
            culture and bachata to everything he does.
          </p>
          <p>
            He hosts the monthly <strong className="text-white">Muevete Brunch</strong>, teaches
            bachata Dominican style, DJs events across South Florida, and creates daily content
            about dance, culture, food, and family life.
          </p>
          <p>
            The Jose Show is where it all comes together &mdash; videos across YouTube, Instagram,
            Facebook, and TikTok powered by an AI-driven content pipeline that helps Jose share
            his world with fans everywhere.
          </p>
        </div>
      </section>

      {/* Platforms */}
      <section className="bg-white/5 py-16">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold mb-8 text-center">Find Jose Everywhere</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <PlatformCard name="YouTube" handle="@Thejoseshowtv" href={SOCIAL_LINKS.youtube} />
            <PlatformCard name="Instagram" handle="@thejoseadelshow" href={SOCIAL_LINKS.instagram} />
            <PlatformCard name="Facebook" handle="thejoseadelshow" href={SOCIAL_LINKS.facebook} />
            <PlatformCard name="TikTok" handle="@thejoseshow_" href={SOCIAL_LINKS.tiktok} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="max-w-3xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} {SITE_NAME}</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-gray-300 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-300 transition-colors">Terms</Link>
            <Link href="/data-deletion" className="hover:text-gray-300 transition-colors">Data Deletion</Link>
            <Link href="/login" className="hover:text-gray-300 transition-colors">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SocialLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium"
    >
      {label}
    </a>
  );
}

function PlatformCard({ name, handle, href }: { name: string; handle: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-center"
    >
      <span className="text-sm font-semibold">{name}</span>
      <span className="text-xs text-gray-400">{handle}</span>
    </a>
  );
}
