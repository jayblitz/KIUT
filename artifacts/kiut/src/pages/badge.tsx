import { useEffect } from "react";
import { useParams, Link } from "wouter";
import { useGetNftMetadata, getGetNftMetadataQueryKey, useGetNftOwner, getGetNftOwnerQueryKey } from "@workspace/api-client-react";
import { NftReceiptCard } from "@/components/NftReceiptCard";
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react";

export default function BadgePage() {
  const { tokenId } = useParams<{ tokenId: string }>();

  const isValidTokenId = Boolean(tokenId) && /^\d+$/.test(tokenId ?? "");

  const { data: metadata, isLoading, isError } = useGetNftMetadata(tokenId ?? "", {
    query: {
      enabled: isValidTokenId,
      queryKey: getGetNftMetadataQueryKey(tokenId ?? ""),
      retry: 1,
    },
  });

  const { data: ownerData, isLoading: isOwnerLoading } = useGetNftOwner(tokenId ?? "", {
    query: {
      enabled: isValidTokenId,
      queryKey: getGetNftOwnerQueryKey(tokenId ?? ""),
      retry: 1,
    },
  });

  useEffect(() => {
    const name = metadata?.name ?? (tokenId ? `KIUT #${tokenId}` : "KIUT Badge");
    document.title = `${name} — KIUT Onchain Proof of Humanity`;
    return () => {
      document.title = "KIUT — Onchain Proof of Humanity";
    };
  }, [metadata, tokenId]);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-15%] left-[-5%] w-[45%] h-[45%] rounded-full bg-primary/8 dark:bg-primary/10 blur-[140px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[50%] rounded-full bg-primary/5 dark:bg-primary/6 blur-[120px]" />
      </div>

      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src="/kiut-badge.jpeg" alt="KIUT" className="w-7 h-7 rounded-lg" />
            <span className="text-lg font-bold tracking-tight">KIUT</span>
          </Link>
          <div className="flex-1" />
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            <ArrowLeft className="w-4 h-4" />
            Get Verified
          </Link>
        </div>
      </header>

      <main className="flex-1 relative z-10 flex flex-col items-center justify-center px-4 py-16">
        {!isValidTokenId && (
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-destructive" />
            </div>
            <h1 className="text-xl font-semibold">Invalid Token ID</h1>
            <p className="text-muted-foreground text-sm">
              The token ID in this URL is not valid. Token IDs must be non-negative integers.
            </p>
            <Link
              href="/"
              className="mt-2 text-sm text-primary hover:underline underline-offset-4"
            >
              ← Back to KIUT
            </Link>
          </div>
        )}

        {isValidTokenId && isLoading && (
          <div className="flex flex-col items-center gap-4 text-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-muted-foreground text-sm">Loading badge…</p>
          </div>
        )}

        {isValidTokenId && isError && (
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-destructive" />
            </div>
            <h1 className="text-xl font-semibold">Badge Not Found</h1>
            <p className="text-muted-foreground text-sm">
              Token <span className="font-mono">#{tokenId}</span> could not be found. Make sure the token ID is correct.
            </p>
            <Link
              href="/"
              className="mt-2 text-sm text-primary hover:underline underline-offset-4"
            >
              ← Back to KIUT
            </Link>
          </div>
        )}

        {isValidTokenId && !isLoading && !isError && metadata && (
          <div className="w-full max-w-sm">
            <div className="text-center mb-8">
              <span className="text-xs font-bold tracking-widest uppercase text-primary mb-2 block">
                Verified Human
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                KIUT Soulbound Badge
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                This NFT is permanent proof of verified humanity on Inkonchain.
              </p>
            </div>

            <NftReceiptCard
              tokenId={tokenId ?? ""}
              walletAddress={ownerData?.walletAddress ?? ""}
              isOwnerLoading={isOwnerLoading}
              shareUrl={shareUrl}
            />

            <div className="mt-8 text-center">
              <p className="text-xs text-muted-foreground mb-3">
                Don't have your KIUT badge yet?
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline underline-offset-4 transition-colors"
              >
                Get verified and mint yours →
              </Link>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-border/50 bg-background/80 backdrop-blur-sm relative z-10">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src="/kiut-badge.jpeg" alt="KIUT" className="w-6 h-6 rounded-md" />
              <span className="font-semibold text-sm">KIUT</span>
              <span className="text-muted-foreground text-sm">— Onchain Identity Verification</span>
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
