import { useState, useEffect } from "react";
import { useAccount, useSignMessage, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEventLogs } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import {
  useGetSignMessage,
  useStartKrakenAuth,
  useCreateAttestation,
  useMintKiutNft,
  useGetNftStatus,
  getGetNftStatusQueryKey,
  confirmNftMint,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, ArrowRight, ShieldCheck, Lock, Zap, ExternalLink, Copy } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { KIUT_ABI } from "@/lib/kiut-contract";

type Step = 1 | 2 | 3 | 4;
type MintPhase = "ready" | "authorizing" | "waiting-wallet" | "confirming-tx" | "confirming-db" | "done";

const SESSION_KEY = "kiut_verification_state";

interface VerificationState {
  signature: string;
  nonce: string;
  walletAddress: string;
}

// ─── NFT Receipt Card ────────────────────────────────────────────────────────

function NftReceiptCard({
  tokenId,
  txHash,
  contractAddress,
  walletAddress,
}: {
  tokenId: string;
  txHash: string;
  contractAddress: string;
  walletAddress: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const INK_EXPLORER = "https://explorer.inkonchain.com";

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  function shortAddr(addr: string) {
    return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
  }

  return (
    <div className="w-full max-w-sm mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Card */}
      <div className="relative rounded-2xl overflow-hidden border border-primary/40 shadow-[0_0_60px_rgba(147,51,234,0.25)]">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-950/90 via-purple-900/80 to-indigo-950/90" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.3)_0%,transparent_70%)]" />

        <div className="relative z-10 p-6 flex flex-col items-center gap-5">
          {/* Badge */}
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-primary/40 blur-2xl scale-125" />
            <img
              src="/kiut-badge.jpeg"
              alt="KIUT Badge"
              className="relative w-24 h-24 rounded-2xl border-2 border-primary/50 shadow-2xl"
            />
          </div>

          {/* Title */}
          <div className="text-center">
            <div className="text-2xl font-bold text-white tracking-tight mb-1">
              KIUT #{tokenId}
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs font-medium">
                Soulbound Token
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                ✓ Verified
              </span>
            </div>
          </div>

          {/* Info grid */}
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
            <InfoCell
              label="Contract"
              value={shortAddr(contractAddress)}
              onCopy={() => copy(contractAddress, "contract")}
              copied={copied === "contract"}
              link={`${INK_EXPLORER}/address/${contractAddress}`}
              fullSpan={false}
            />
            <InfoCell
              label="Wallet"
              value={shortAddr(walletAddress)}
              onCopy={() => copy(walletAddress, "wallet")}
              copied={copied === "wallet"}
              link={`${INK_EXPLORER}/address/${walletAddress}`}
              fullSpan={false}
            />
          </div>

          {/* View on explorer */}
          <a
            href={`${INK_EXPLORER}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/10 border border-white/20 text-white/80 hover:bg-white/15 hover:text-white transition-all duration-200 text-sm font-medium"
          >
            View Mint Transaction <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Subtitle below card */}
      <p className="text-center text-xs text-muted-foreground mt-3">
        This soulbound NFT is permanently bound to your wallet and cannot be transferred.
      </p>
    </div>
  );
}

function InfoCell({
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
            <a href={link} target="_blank" rel="noreferrer" className="text-white/40 hover:text-white/80 transition-colors">
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {copyable && onCopy && (
            <button
              onClick={onCopy}
              className="text-white/40 hover:text-white/80 transition-colors"
            >
              {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Wizard ─────────────────────────────────────────────────────────────

export default function Wizard() {
  const { address, isConnected } = useAccount();
  const [step, setStep] = useState<Step>(1);
  const [attestationUid, setAttestationUid] = useState("");
  const [isAttesting, setIsAttesting] = useState(false);

  // Mint flow state
  const [mintPhase, setMintPhase] = useState<MintPhase>("ready");
  const [mintTxHash, setMintTxHash] = useState<`0x${string}` | undefined>();
  const [mintTokenId, setMintTokenId] = useState<string | undefined>();
  const [mintContractAddress, setMintContractAddress] = useState<string | undefined>();

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Queries & Mutations ───────────────────────────────────────────────────
  const { data: nftStatus } = useGetNftStatus(address || "", {
    query: {
      enabled: !!address,
      queryKey: getGetNftStatusQueryKey(address || ""),
      refetchInterval: (query) => (query.state.data?.hasMinted ? false : 5000),
    },
  });

  const getSignMessage = useGetSignMessage();
  const { signMessage } = useSignMessage();
  const startKrakenAuth = useStartKrakenAuth();
  const createAttestation = useCreateAttestation();
  const mintNftAuth = useMintKiutNft();

  // wagmi hooks for on-chain mint
  const { writeContractAsync } = useWriteContract();
  const { data: txReceipt } = useWaitForTransactionReceipt({
    hash: mintTxHash,
    query: { enabled: !!mintTxHash && mintPhase === "confirming-tx" },
  });

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (nftStatus?.hasMinted && mintPhase === "ready") {
      setStep(4);
    }
  }, [nftStatus]);

  useEffect(() => {
    if (isConnected && step === 1 && !nftStatus?.hasMinted) {
      setStep(2);
    }
  }, [isConnected, step, nftStatus]);

  // Kraken OAuth callback handler
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("krakenLinked") !== "true") return;

    window.history.replaceState({}, "", window.location.pathname);

    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) {
      toast({ variant: "destructive", title: "Session expired", description: "Please start the verification again." });
      setStep(2);
      return;
    }

    let verState: VerificationState;
    try {
      verState = JSON.parse(stored) as VerificationState;
    } catch {
      toast({ variant: "destructive", title: "Session error", description: "Please start the verification again." });
      setStep(2);
      return;
    }

    sessionStorage.removeItem(SESSION_KEY);
    setIsAttesting(true);

    createAttestation.mutate(
      {
        data: {
          walletAddress: verState.walletAddress,
          signature: verState.signature,
          nonce: verState.nonce,
        },
      },
      {
        onSuccess: (data) => {
          setAttestationUid(data.attestationUid);
          setStep(4);
          setIsAttesting(false);
        },
        onError: (err) => {
          setIsAttesting(false);
          toast({ variant: "destructive", title: "Attestation failed", description: err.message });
          setStep(4);
        },
      },
    );
  }, []);

  // Watch tx receipt → parse Minted event, call confirm
  useEffect(() => {
    if (!txReceipt || mintPhase !== "confirming-tx" || !address || !mintContractAddress) return;

    setMintPhase("confirming-db");

    let tokenIdStr: string | undefined;
    try {
      const logs = parseEventLogs({
        abi: KIUT_ABI,
        eventName: "Minted",
        logs: txReceipt.logs,
      });
      tokenIdStr = logs[0]?.args?.tokenId?.toString();
    } catch {
      // Fallback: parse tokenId from indexed topic
      const mintedSig = "0x30385c845b448a36257a6a1716e6ad2e1bc2cbe333cde1e69fe849ad6511adfe";
      const log = txReceipt.logs.find((l) => l.topics[0] === mintedSig);
      if (log?.topics[2]) {
        tokenIdStr = BigInt(log.topics[2]).toString();
      }
    }

    if (!tokenIdStr) tokenIdStr = "1";
    setMintTokenId(tokenIdStr);

    const txHash = txReceipt.transactionHash;

    confirmNftMint({
      walletAddress: address,
      txHash,
      tokenId: tokenIdStr,
    })
      .then(() => {
        setMintPhase("done");
        queryClient.invalidateQueries({ queryKey: getGetNftStatusQueryKey(address) });
        toast({ title: "KIUT NFT Minted!", description: `Token #${tokenIdStr} is now permanently bound to your wallet.` });
      })
      .catch(() => {
        // Even if confirm fails, we still show the receipt since the on-chain mint succeeded
        setMintPhase("done");
        queryClient.invalidateQueries({ queryKey: getGetNftStatusQueryKey(address) });
      });
  }, [txReceipt]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSign = () => {
    if (!address) return;
    getSignMessage.mutate(
      { data: { walletAddress: address } },
      {
        onSuccess: (data) => {
          signMessage(
            { message: data.message },
            {
              onSuccess: (sig) => {
                const verState: VerificationState = {
                  signature: sig,
                  nonce: data.nonce,
                  walletAddress: address,
                };
                sessionStorage.setItem(SESSION_KEY, JSON.stringify(verState));
                setStep(3);
              },
              onError: (err) => {
                toast({ variant: "destructive", title: "Signing failed", description: err.message });
              },
            },
          );
        },
        onError: (err) => {
          toast({ variant: "destructive", title: "Failed to get message", description: err.message });
        },
      },
    );
  };

  const handleConnectKraken = () => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored || !address) {
      toast({ variant: "destructive", title: "Missing verification state", description: "Please sign a message first." });
      setStep(2);
      return;
    }
    const verState: VerificationState = JSON.parse(stored);
    startKrakenAuth.mutate(
      { data: { walletAddress: verState.walletAddress, signature: verState.signature, nonce: verState.nonce } },
      {
        onSuccess: (data) => {
          window.location.href = data.authUrl;
        },
        onError: (err) => {
          toast({ variant: "destructive", title: "Failed to start Kraken auth", description: err.message });
        },
      },
    );
  };

  const handleMint = async () => {
    if (!address) return;
    const uid = attestationUid || nftStatus?.attestationUid || "";
    if (!uid) {
      toast({
        variant: "destructive",
        title: "Missing attestation",
        description: "No attestation found. Please complete verification first.",
      });
      return;
    }

    // Step A: get backend authorization
    setMintPhase("authorizing");
    mintNftAuth.mutate(
      { data: { walletAddress: address, attestationUid: uid } },
      {
        onSuccess: async (auth) => {
          const { signature, mintFee, contractAddress } = auth;
          setMintContractAddress(contractAddress);

          // Step B: ask wallet to call contract.mint(signature)
          setMintPhase("waiting-wallet");
          try {
            const txHash = await writeContractAsync({
              address: contractAddress as `0x${string}`,
              abi: KIUT_ABI,
              functionName: "mint",
              args: [signature as `0x${string}`],
              value: BigInt(mintFee),
            });
            setMintTxHash(txHash);
            setMintPhase("confirming-tx");
          } catch (err) {
            setMintPhase("ready");
            const msg = err instanceof Error ? err.message : String(err);
            toast({
              variant: "destructive",
              title: "Transaction rejected",
              description: msg.includes("User rejected") ? "You rejected the transaction in your wallet." : msg.slice(0, 120),
            });
          }
        },
        onError: (err) => {
          setMintPhase("ready");
          toast({ variant: "destructive", title: "Authorization failed", description: err.message });
        },
      },
    );
  };

  // ── Derived display state ─────────────────────────────────────────────────

  const isMintDone = mintPhase === "done" || (nftStatus?.hasMinted && mintPhase === "ready");

  const displayTokenId = mintTokenId || nftStatus?.tokenId || "–";
  const displayTxHash = mintTxHash || nftStatus?.txHash || "";
  const displayContract = mintContractAddress || "";
  const displayWallet = address || "";

  const stepLabels = ["Connect Wallet", "Sign Message", "Link Kraken", "Mint NFT"];

  // ── Mint phase labels ─────────────────────────────────────────────────────

  function mintButtonLabel() {
    switch (mintPhase) {
      case "authorizing": return "Getting authorization…";
      case "waiting-wallet": return "Approve in wallet…";
      case "confirming-tx": return "Confirming on-chain…";
      case "confirming-db": return "Finalising…";
      default: return "Mint KIUT NFT";
    }
  }

  const isMinting = mintPhase !== "ready" && mintPhase !== "done";

  return (
    <div className="w-full max-w-xl mx-auto border border-border bg-card rounded-2xl p-6 shadow-2xl relative overflow-hidden">
      {/* Progress bar */}
      <div className="absolute top-0 left-0 w-full h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${(step / 4) * 100}%` }}
        />
      </div>

      {/* Step tabs */}
      <div className="flex gap-2 mb-8 text-xs font-medium">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <div
            key={s}
            className={`flex-1 text-center py-2 border-b-2 transition-colors ${
              step >= s ? "border-primary text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {stepLabels[s - 1]}
          </div>
        ))}
      </div>

      <div className="min-h-[320px] flex flex-col items-center justify-center text-center space-y-6">

        {/* ── Step 1: Connect Wallet ───────────────────────────────────────── */}
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Lock className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-foreground mb-2">Connect Your Wallet</h2>
            <p className="text-muted-foreground mb-8 max-w-md">
              Connect your Web3 wallet to start the verification process. This wallet will hold your soulbound NFT.
            </p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        )}

        {/* ── Step 2: Sign Message ─────────────────────────────────────────── */}
        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
            <ShieldCheck className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-foreground mb-2">Prove Wallet Ownership</h2>
            <p className="text-muted-foreground mb-1 text-sm font-mono">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Sign a message to prove you control this wallet. Free — no gas required.
            </p>
            <Button
              size="lg"
              className="w-full max-w-sm"
              onClick={handleSign}
              disabled={getSignMessage.isPending || !address}
            >
              {getSignMessage.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sign Message <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        )}

        {/* ── Step 3: Link Kraken ──────────────────────────────────────────── */}
        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-2xl font-bold text-primary">K</span>
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">Link Kraken Account</h2>
            <p className="text-muted-foreground mb-2 text-sm font-mono">
              {address?.slice(0, 6)}...{address?.slice(-4)} ✓ signed
            </p>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Connect your verified Kraken account to establish your onchain identity. You will be redirected to Kraken.
            </p>
            <Button
              size="lg"
              className="w-full max-w-sm"
              onClick={handleConnectKraken}
              disabled={startKrakenAuth.isPending}
            >
              {startKrakenAuth.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Connect Kraken <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        )}

        {/* ── Step 4: Mint ─────────────────────────────────────────────────── */}
        {step === 4 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">

            {isAttesting ? (
              <div className="space-y-4">
                <Loader2 className="w-12 h-12 text-primary mx-auto animate-spin" />
                <h2 className="text-xl font-semibold">Creating Attestation…</h2>
                <p className="text-muted-foreground text-sm">Issuing your EAS attestation on Inkonchain.</p>
              </div>

            ) : isMintDone ? (
              /* ── Receipt card ──────────────────────────────────────────── */
              <NftReceiptCard
                tokenId={displayTokenId}
                txHash={displayTxHash}
                contractAddress={displayContract}
                walletAddress={displayWallet}
              />

            ) : (
              /* ── Pre-mint CTA ──────────────────────────────────────────── */
              <div className="space-y-6">
                {isMinting ? (
                  <Loader2 className="w-12 h-12 text-primary mx-auto animate-spin" />
                ) : (
                  <Zap className="w-12 h-12 text-primary mx-auto" />
                )}

                <h2 className="text-2xl font-semibold text-foreground">
                  {isMinting ? mintButtonLabel().replace("…", "") : "Ready to Mint"}
                </h2>

                {!isMinting && (
                  <div className="text-sm text-muted-foreground space-y-1.5 bg-muted/40 rounded-lg p-4 text-left max-w-sm mx-auto">
                    <p>Wallet: <span className="font-mono text-foreground">{address?.slice(0, 6)}…{address?.slice(-4)}</span></p>
                    <p>Attestation: <span className="font-mono text-foreground">{(attestationUid || nftStatus?.attestationUid || "–").slice(0, 12)}…</span></p>
                    <p>Chain: <span className="text-foreground">Inkonchain (57073)</span></p>
                    <p>Mint fee: <span className="text-foreground">0.0005 ETH</span></p>
                    <p>Type: <span className="text-foreground">Soulbound · Non-transferable</span></p>
                  </div>
                )}

                {isMinting && (
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p className={mintPhase === "authorizing" ? "text-primary" : ""}>
                      {mintPhase === "authorizing" ? "▶" : "✓"} Getting backend authorization
                    </p>
                    <p className={mintPhase === "waiting-wallet" ? "text-primary" : mintPhase === "authorizing" ? "text-muted-foreground/40" : ""}>
                      {mintPhase === "waiting-wallet" ? "▶" : mintPhase === "authorizing" ? "○" : "✓"} Approve in wallet
                    </p>
                    <p className={["confirming-tx", "confirming-db"].includes(mintPhase) ? "text-primary" : "text-muted-foreground/40"}>
                      {mintPhase === "confirming-tx" || mintPhase === "confirming-db" ? "▶" : "○"} Confirming on-chain
                    </p>
                  </div>
                )}

                {!isMinting && (
                  <Button
                    size="lg"
                    className="w-full max-w-sm bg-primary hover:bg-primary/90 text-white shadow-[0_0_20px_rgba(147,51,234,0.3)]"
                    onClick={handleMint}
                    disabled={!attestationUid && !nftStatus?.attestationUid}
                  >
                    <Zap className="mr-2 w-4 h-4" />
                    Mint KIUT NFT
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
