import { useState, useRef } from "react";
import Wizard from "@/components/Wizard";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { useTheme } from "@/lib/theme";
import {
  Sun, Moon, ChevronRight, ArrowDown, Shield, Lock, Zap, Globe, ExternalLink, Play, Pause,
} from "lucide-react";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="w-9 h-9 rounded-full flex items-center justify-center border border-border bg-secondary/60 hover:bg-secondary text-foreground transition-all duration-200 hover:scale-110 hover:border-primary/50"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

function StepCard({
  number, icon: Icon, title, description, delay,
}: { number: string; icon: React.ElementType; title: string; description: string; delay: string }) {
  return (
    <div
      className="card-hover gradient-border relative flex flex-col gap-4 p-6 rounded-2xl bg-card border border-border"
      style={{ animationDelay: delay }}
    >
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-primary/60 tracking-widest uppercase">Step {number}</span>
        <div className="flex-1 h-px bg-border" />
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function FeatureCard({
  icon: Icon, title, description, accent,
}: { icon: React.ElementType; title: string; description: string; accent: string }) {
  return (
    <div className="card-hover group relative flex flex-col gap-4 p-6 rounded-2xl bg-card border border-border overflow-hidden">
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${accent} blur-3xl scale-150`} />
      <div className="relative z-10">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-primary/20 transition-all duration-300">
          <Icon className="w-6 h-6 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-3 rounded-2xl bg-card border border-border hover:border-primary/40 transition-colors duration-200">
      <span className="text-2xl font-bold text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}

export default function Home() {
  const [started, setStarted] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wizardRef = useRef<HTMLDivElement>(null);

  function handleGetStarted() {
    setStarted(true);
    setTimeout(() => wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  function toggleVideo() {
    if (!videoRef.current) return;
    if (videoPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setVideoPlaying(!videoPlaying);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative">
      {/* ── Ambient background glows ─── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-15%] left-[-5%] w-[45%] h-[45%] rounded-full bg-primary/8 dark:bg-primary/10 blur-[140px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[50%] rounded-full bg-primary/5 dark:bg-primary/6 blur-[120px]" />
        <div className="absolute top-[40%] left-[30%] w-[30%] h-[30%] rounded-full bg-violet-500/3 dark:bg-violet-500/5 blur-[100px]" />
      </div>
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/kiut-badge.jpeg" alt="KIUT" className="w-7 h-7 rounded-lg" />
            <span className="text-lg font-bold tracking-tight">KIUT</span>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#how-it-works" className="hover:text-foreground transition-colors duration-150">How It Works</a>
            <a href="#demo" className="hover:text-foreground transition-colors duration-150">SBT</a>
            <a href="#faq" className="hover:text-foreground transition-colors duration-150">FAQ</a>
            <a
              href="https://docs.inkonchain.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition-colors duration-150 flex items-center gap-1"
            >
              Docs <ExternalLink className="w-3 h-3" />
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button
              size="sm"
              className="hidden sm:flex bg-primary hover:bg-primary/90 text-white shadow-sm hover:shadow-[0_0_20px_rgba(147,51,234,0.35)] transition-all duration-200"
              onClick={handleGetStarted}
            >
              Get Verified
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 relative z-10">

        {/* ── Hero ──────────────────────────────────────────── */}
        <section className="relative flex flex-col items-center justify-center text-center px-4 pt-24 pb-16 min-h-[92vh]">

          {/* Badge image */}
          <div className="relative mb-10 group">
            <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-3xl scale-125 opacity-50 group-hover:opacity-90 transition-opacity duration-700" />
            <div className="absolute inset-0 rounded-2xl animate-pulse-glow opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <img
              src="/kiut-badge.jpeg"
              alt="KIUT Badge"
              className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-2xl shadow-2xl border border-primary/20 animate-float z-10"
            />
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 max-w-4xl leading-[1.08]">
            <span className="text-foreground">Prove You Are </span>
            <span className="shimmer-text">Human</span>
            <span className="text-foreground">,<br />Onchain.</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed">
            Connect your verified Kraken account to your Web3 wallet and receive a permanent
            soulbound NFT on Inkonchain — your identity, cryptographically secured forever.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 mb-16">
            <Button
              size="lg"
              className="h-12 px-8 text-base bg-primary hover:bg-primary/90 text-white shadow-[0_0_30px_rgba(147,51,234,0.3)] hover:shadow-[0_0_50px_rgba(147,51,234,0.5)] hover:scale-105 transition-all duration-200"
              onClick={handleGetStarted}
            >
              Get Started <ChevronRight className="ml-1 w-4 h-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 px-8 text-base border-border hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-all duration-200"
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            >
              Learn How It Works <ArrowDown className="ml-1 w-4 h-4" />
            </Button>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <StatPill value="EAS" label="Attestation Standard" />
            <StatPill value="INK" label="Inkonchain" />
            <StatPill value="0 Cost" label="No Signing Fee" />
            <StatPill value="1:1" label="Wallet per Account" />
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-muted-foreground/60 animate-bounce">
            <span className="text-xs tracking-widest uppercase">Scroll</span>
            <ArrowDown className="w-4 h-4" />
          </div>
        </section>

        {/* ── Wizard (appears when started) ─────────────────── */}
        {started && (
          <section className="py-12 px-4 max-w-xl mx-auto" ref={wizardRef}>
            <Wizard />
          </section>
        )}

        {/* ── How It Works ──────────────────────────────────── */}
        <section id="how-it-works" className="py-24 px-4 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs font-bold tracking-widest uppercase text-primary mb-3 block">Simple Process</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">How It Works</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Four steps to prove your humanity onchain. Takes less than two minutes.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <StepCard
              number="01"
              icon={Lock}
              title="Connect Wallet"
              description="Connect any EVM wallet using RainbowKit. Your wallet will hold the soulbound NFT permanently."
              delay="0ms"
            />
            <StepCard
              number="02"
              icon={Shield}
              title="Sign Message"
              description="Sign an EIP-191 personal message to cryptographically prove you own the connected wallet. Free — no gas."
              delay="75ms"
            />
            <StepCard
              number="03"
              icon={Globe}
              title="Link Kraken"
              description="Authorize KIUT to confirm your Kraken account status via OAuth. No trading data is accessed."
              delay="150ms"
            />
            <StepCard
              number="04"
              icon={Zap}
              title="Mint NFT"
              description="Receive your EAS attestation on Inkonchain and mint your soulbound KIUT NFT — permanent proof of humanity."
              delay="225ms"
            />
          </div>
        </section>

        {/* ── Demo Video ────────────────────────────────────── */}
        <section id="demo" className="py-24 px-4 bg-muted/30 dark:bg-muted/20">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <span className="text-xs font-bold tracking-widest uppercase text-primary mb-3 block">Claim is LIVE</span>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Claim you unique SBT</h2>
              <p className="text-muted-foreground">View the NFT in your wallet</p>
            </div>

            <div
              className="relative rounded-2xl overflow-hidden border border-border shadow-2xl group cursor-pointer"
              onClick={toggleVideo}
            >
              <video
                ref={videoRef}
                src="/kiut-demo.mp4"
                className="w-full aspect-video object-cover"
                loop
                playsInline
                onPlay={() => setVideoPlaying(true)}
                onPause={() => setVideoPlaying(false)}
              />
              {/* Play/pause overlay */}
              <div className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-300 ${videoPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}>
                <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center hover:scale-110 transition-transform duration-200">
                  {videoPlaying
                    ? <Pause className="w-6 h-6 text-white" />
                    : <Play className="w-6 h-6 text-white ml-0.5" />}
                </div>
              </div>
              {/* Gradient border glow on hover */}
              <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-primary/0 group-hover:ring-primary/30 transition-all duration-300 pointer-events-none" />
            </div>
          </div>
        </section>

        {/* ── Features ──────────────────────────────────────── */}
        <section className="py-24 px-4 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs font-bold tracking-widest uppercase text-primary mb-3 block">Why KIUT</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Built for Humanity</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Every owner, is a verified kraken &amp; Inkonchain user.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <FeatureCard
              icon={Lock}
              title="Soulbound & Permanent"
              description="Your KIUT NFT cannot be transferred, sold, or revoked by anyone else. Once minted, it is permanently bound to your wallet — a true proof of humanity."
              accent="bg-violet-500/5"
            />
            <FeatureCard
              icon={Shield}
              title="Privacy Preserving"
              description="Only your wallet address goes onchain. Your name, email, trading history, and personal data never leave Kraken. Zero personal information is exposed."
              accent="bg-blue-500/5"
            />
            <FeatureCard
              icon={Zap}
              title="EAS Attestation"
              description="Built on the Ethereum Attestation Service — an open standard for onchain trust. Your attestation is readable by any dapp or protocol on Inkonchain."
              accent="bg-purple-500/5"
            />
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────── */}
        <section id="faq" className="py-24 px-4 bg-muted/30 dark:bg-muted/20">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-16">
              <span className="text-xs font-bold tracking-widest uppercase text-primary mb-3 block">Got Questions</span>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Frequently Asked</h2>
            </div>

            <Accordion type="single" collapsible className="w-full space-y-2">
              {[
                {
                  q: "What is KIUT?",
                  a: "KIUT is a soulbound NFT that proves you are a verified, unique human onchain. It links your Kraken exchange account to your Web3 wallet via an EAS attestation on Inkonchain."
                },
                {
                  q: "What goes onchain?",
                  a: "Only your wallet address and a confirmation that it's been verified — nothing else. Your personal details, name, and trading data stay private on Kraken."
                },
                {
                  q: "Is KIUT transferable?",
                  a: "No. KIUT is a soulbound NFT — it cannot be transferred or sold. It is permanently bound to your wallet address."
                },
                {
                  q: "Do I pay gas fees?",
                  a: "Signing the verification message is free (no gas). Minting the NFT requires a small gas fee on Inkonchain, which is extremely low — typically under $0.01."
                },
                {
                  q: "How many wallets can I verify?",
                  a: "One wallet per Kraken account. This one-to-one mapping is what makes KIUT a reliable proof of unique humanity."
                },
                {
                  q: "What can I use KIUT for?",
                  a: "KIUT is accepted by ecosystem partners as proof of humanity. It integrates into Proof of Humanity verification criteria and gating mechanisms for dapps on Inkonchain."
                },
                {
                  q: "How does the verification work technically?",
                  a: "You sign an EIP-191 personal message to prove wallet ownership, then authorize KIUT via Kraken OAuth. The backend issues an EAS attestation on Inkonchain linking your verified Kraken identity to your wallet."
                },
              ].map((item, i) => (
                <AccordionItem
                  key={i}
                  value={`item-${i}`}
                  className="border border-border rounded-xl px-5 data-[state=open]:border-primary/40 transition-colors duration-200 bg-card"
                >
                  <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4 leading-relaxed">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* ── CTA Banner ────────────────────────────────────── */}
        <section className="py-24 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="relative rounded-3xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-12 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-violet-500/10 pointer-events-none" />
              <div className="relative z-10">
                <img src="/kiut-badge.jpeg" alt="KIUT" className="w-16 h-16 rounded-xl mx-auto mb-6 shadow-lg" />
                <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                  Ready to Verify Your Humanity?
                </h2>
                <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                  Join the growing network of verified humans on Inkonchain. Takes less than two minutes.
                </p>
                <Button
                  size="lg"
                  className="h-12 px-10 text-base bg-primary hover:bg-primary/90 text-white shadow-[0_0_30px_rgba(147,51,234,0.4)] hover:shadow-[0_0_50px_rgba(147,51,234,0.6)] hover:scale-105 transition-all duration-200"
                  onClick={handleGetStarted}
                >
                  Get Your KIUT <ChevronRight className="ml-1 w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>

      </main>
      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="border-t border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <img src="/kiut-badge.jpeg" alt="KIUT" className="w-6 h-6 rounded-md" />
              <span className="font-semibold text-sm">KIUT</span>
              <span className="text-muted-foreground text-sm">— Onchain Identity Verification</span>
            </div>

            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="https://docs.inkonchain.com" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors flex items-center gap-1">
                Inkonchain <ExternalLink className="w-3 h-3" />
              </a>
              <a href="https://kraken.com" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors flex items-center gap-1">
                Kraken <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="text-xs text-muted-foreground/60">
              © {new Date().getFullYear()} KIUT. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
