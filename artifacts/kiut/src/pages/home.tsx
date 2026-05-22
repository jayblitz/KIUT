import { useState } from "react";
import Wizard from "@/components/Wizard";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export default function Home() {
  const [started, setStarted] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
      {/* Background glow effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[100px] rounded-full mix-blend-screen" />
      </div>

      <header className="w-full px-6 py-4 flex items-center justify-between z-10 relative border-b border-border/40 bg-background/50 backdrop-blur-md">
        <div className="text-2xl font-bold tracking-tighter text-white flex items-center gap-2">
          KIUT
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-20 z-10 relative w-full max-w-5xl mx-auto">
        {!started ? (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 text-center max-w-3xl mx-auto flex flex-col items-center">
            <div className="mb-12 relative group">
              <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <img 
                src="/kiut-badge.jpeg" 
                alt="KIUT Artifact" 
                className="w-48 h-48 sm:w-64 sm:h-64 rounded-xl shadow-2xl relative z-10 border border-primary/20"
              />
            </div>
            
            <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
              Prove You Are Human, Onchain.
            </h1>
            
            <p className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed">
              Verify your Kraken account, connect your wallet, and receive a permanent soulbound NFT on Inkonchain. Your identity, cryptographically secured.
            </p>
            
            <Button 
              size="lg" 
              className="h-14 px-8 text-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_30px_rgba(147,51,234,0.3)] hover:shadow-[0_0_40px_rgba(147,51,234,0.5)] transition-all"
              onClick={() => setStarted(true)}
            >
              Get Started <ChevronRight className="ml-2" />
            </Button>
          </div>
        ) : (
          <div className="w-full animate-in zoom-in-95 duration-500">
            <Wizard />
          </div>
        )}
        
        {/* FAQ Section */}
        <div className="w-full mt-32 max-w-3xl">
          <h3 className="text-3xl font-semibold mb-8 text-center">Frequently Asked Questions</h3>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>What is KIUT?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                KIUT is a soulbound NFT that proves you are a verified, unique human onchain. It links your Kraken exchange account to your Web3 wallet via an EAS attestation on Inkonchain.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>What goes onchain?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Only your wallet address and a confirmation that it's been verified — nothing else. Your personal details stay private.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>Is KIUT transferable?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                No. KIUT is a soulbound NFT — it cannot be transferred or sold. It is permanently bound to your wallet.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>Do I pay gas fees?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Gas fees on Inkonchain are very low. You sign a message (free) and mint an NFT (minimal gas).
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-5">
              <AccordionTrigger>How many wallets can I verify?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                One wallet per Kraken account. You can revoke and re-verify with a different wallet.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-6">
              <AccordionTrigger>What can I use KIUT for?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                KIUT is accepted by ecosystem partners as proof of humanity. It will be integrated into Proof of Humanity verification criteria.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-7">
              <AccordionTrigger>How does the verification work?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                KIUT uses the Ethereum Attestation Service (EAS) on Inkonchain. When you verify, an attestation is issued onchain confirming your wallet is linked to a Kraken-verified identity.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </main>

      <footer className="w-full py-6 text-center border-t border-border/40 text-muted-foreground text-sm z-10 relative bg-background/80">
        <p>KIUT — Onchain Identity Verification</p>
      </footer>
    </div>
  );
}
