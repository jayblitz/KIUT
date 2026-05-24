import { useState } from "react";
import { CheckCircle2, ExternalLink, Copy, Twitter } from "lucide-react";
import {
  useGetNftMetadata,
  getGetNftMetadataQueryKey,
} from "@workspace/api-client-react";

export function NftReceiptCard({
  tokenId,
  txHash = "",
  contractAddress,
  walletAddress = "",
  isOwnerLoading = false,
  shareUrl,
}: {
  tokenId: string;
  txHash?: string;
  contractAddress?: string;
  walletAddress?: string;
  isOwnerLoading?: boolean;
  shareUrl?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const INK_EXPLORER = "https://explorer.inkonchain.com";

  const hasValidTokenId = Boolean(tokenId) && tokenId !== "–";

  const { data: metadata } = useGetNftMetadata(tokenId, {
    query: { enabled: hasValidTokenId, queryKey: getGetNftMetadataQueryKey(tokenId) },
  });

  const resolvedContract = contractAddress || metadata?.contractAddress || "";
  const nftUrl = metadata?.explorerUrl ?? (resolvedContract
    ? `${INK_EXPLORER}/token/${resolvedContract}/instance/${tokenId}`
    : null);
  const badgeImage = metadata?.image ?? "/kiut-badge.jpeg";
  const badgeName = metadata?.name ?? `KIUT #${tokenId}`;

  const tweetUrl = shareUrl || nftUrl;
  const copyLinkUrl = shareUrl || nftUrl;

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  function shortAddr(addr: string) {
    if (!addr) return "–";
    return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
  }

  return (
    <div className="w-full max-w-sm mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="relative rounded-2xl overflow-hidden border border-primary/40 shadow-[0_0_60px_rgba(147,51,234,0.25)]">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-950/90 via-purple-900/80 to-indigo-950/90" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.3)_0%,transparent_70%)]" />

        <div className="relative z-10 p-6 flex flex-col items-center gap-5">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-primary/40 blur-2xl scale-125" />
            <img
              src={badgeImage}
              alt="KIUT Badge"
              className="relative w-24 h-24 rounded-2xl border-2 border-primary/50 shadow-2xl"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/kiut-badge.jpeg"; }}
            />
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold text-white tracking-tight mb-1">
              {badgeName}
            </div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs font-medium">
                Soulbound Token
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                ✓ Verified
              </span>
            </div>
            {isOwnerLoading ? (
              <p className="text-white/50 text-xs flex items-center justify-center gap-1.5">
                Issued to{" "}
                <span className="inline-block w-24 h-3 rounded bg-white/15 animate-pulse" />
                {" "}on Inkonchain
              </p>
            ) : walletAddress ? (
              <p className="text-white/50 text-xs">
                Issued to{" "}
                <span className="font-mono text-white/70">
                  {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
                </span>{" "}
                on Inkonchain
              </p>
            ) : (
              <p className="text-white/50 text-xs">Issued on Inkonchain</p>
            )}
          </div>

          <div className="w-full grid grid-cols-2 gap-2.5">
            <InfoCell
              label="Token ID"
              value={`#${tokenId}`}
              copyable={false}
            />
            <InfoCell
              label="Blockchain"
              value="Inkonchain"
              badge="Chain 57073"
              copyable={false}
            />
            {resolvedContract && (
              <>
                <InfoCell
                  label="Contract"
                  value={shortAddr(resolvedContract)}
                  onCopy={() => copy(resolvedContract, "contract")}
                  copied={copied === "contract"}
                  link={`${INK_EXPLORER}/address/${resolvedContract}`}
                  fullSpan={false}
                />
                {isOwnerLoading ? (
                  <SkeletonCell label="Wallet" />
                ) : walletAddress ? (
                  <InfoCell
                    label="Wallet"
                    value={shortAddr(walletAddress)}
                    onCopy={() => copy(walletAddress, "wallet")}
                    copied={copied === "wallet"}
                    link={`${INK_EXPLORER}/address/${walletAddress}`}
                    fullSpan={false}
                  />
                ) : (
                  <div />
                )}
              </>
            )}
            {!resolvedContract && (isOwnerLoading ? (
              <SkeletonCell label="Wallet" fullSpan />
            ) : walletAddress ? (
              <InfoCell
                label="Wallet"
                value={shortAddr(walletAddress)}
                onCopy={() => copy(walletAddress, "wallet")}
                copied={copied === "wallet"}
                link={`${INK_EXPLORER}/address/${walletAddress}`}
                fullSpan={true}
              />
            ) : null)}
          </div>

          {nftUrl && (
            <a
              href={nftUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 hover:border-primary/50 transition-all duration-200 text-sm font-medium"
            >
              View NFT on Explorer <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          {txHash && (
            <a
              href={`${INK_EXPLORER}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/10 border border-white/20 text-white/80 hover:bg-white/15 hover:text-white transition-all duration-200 text-sm font-medium"
            >
              View Mint Transaction <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          <div className="w-full grid grid-cols-2 gap-2.5">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                `I just got my KIUT soulbound NFT — verified human on Inkonchain. Token #${tokenId}${tweetUrl ? ` ${tweetUrl}` : ""}`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/10 border border-white/20 text-white/80 hover:bg-white/15 hover:text-white transition-all duration-200 text-sm font-medium"
            >
              <Twitter className="w-3.5 h-3.5" />
              Share on X
            </a>

            <button
              onClick={() => copyLinkUrl && copy(copyLinkUrl, "link")}
              disabled={!copyLinkUrl}
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/10 border border-white/20 text-white/80 hover:bg-white/15 hover:text-white transition-all duration-200 text-sm font-medium disabled:opacity-50"
            >
              {copied === "link" ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Link
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-3">
        This soulbound NFT is permanently bound to your wallet and cannot be transferred.
      </p>
    </div>
  );
}

function SkeletonCell({ label, fullSpan = false }: { label: string; fullSpan?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 p-3 rounded-xl bg-white/5 border border-white/10 ${fullSpan ? "col-span-2" : ""}`}>
      <span className="text-[10px] font-semibold tracking-widest uppercase text-white/40">{label}</span>
      <div className="h-4 w-28 rounded bg-white/15 animate-pulse" />
    </div>
  );
}

export function InfoCell({
  label,
  value,
  badge,
  copyable = true,
  onCopy,
  copied,
  link,
  fullSpan = false,
}: {
  label: string;
  value: string;
  badge?: string;
  copyable?: boolean;
  onCopy?: () => void;
  copied?: boolean;
  link?: string;
  fullSpan?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 p-3 rounded-xl bg-white/5 border border-white/10 ${fullSpan ? "col-span-2" : ""}`}
    >
      <span className="text-[10px] font-semibold tracking-widest uppercase text-white/40">{label}</span>
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-mono text-white truncate">{value}</span>
          {badge && (
            <span className="text-[10px] text-white/40 shrink-0">{badge}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="p-1 -m-1 text-white/40 hover:text-white/80 transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {copyable && onCopy && (
            <button
              onClick={onCopy}
              className="p-1 -m-1 text-white/40 hover:text-white/80 transition-colors"
            >
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
