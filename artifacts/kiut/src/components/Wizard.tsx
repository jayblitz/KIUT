import { useState, useEffect } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { useGetSignMessage, useStartKrakenAuth, useCreateAttestation, useMintKiutNft, useGetNftStatus, getGetNftStatusQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, ArrowRight, ShieldCheck, Lock, Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

type Step = 1 | 2 | 3 | 4;

const SESSION_KEY = "kiut_verification_state";

interface VerificationState {
  signature: string;
  nonce: string;
  walletAddress: string;
  krakenAccountId?: string;
}

export default function Wizard() {
  const { address, isConnected } = useAccount();
  const [step, setStep] = useState<Step>(1);
  const [attestationUid, setAttestationUid] = useState("");
  const [isAttesting, setIsAttesting] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: nftStatus } = useGetNftStatus(address || "", {
    query: {
      enabled: !!address,
      queryKey: getGetNftStatusQueryKey(address || ""),
      refetchInterval: (query) => (query.state.data?.hasMinted ? false : 5000),
    }
  });

  const getSignMessage = useGetSignMessage();
  const { signMessage } = useSignMessage();
  const startKrakenAuth = useStartKrakenAuth();
  const createAttestation = useCreateAttestation();
  const mintNft = useMintKiutNft();

  useEffect(() => {
    if (nftStatus?.hasMinted) {
      setStep(4);
    }
  }, [nftStatus]);

  useEffect(() => {
    if (isConnected && step === 1 && !nftStatus?.hasMinted) {
      setStep(2);
    }
  }, [isConnected, step, nftStatus]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("krakenLinked") !== "true") return;

    const krakenAccountId = searchParams.get("krakenAccountId") ?? "";
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
        }
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
        }
      }
    );
  }, []);

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
              }
            }
          );
        },
        onError: (err) => {
          toast({ variant: "destructive", title: "Failed to get message", description: err.message });
        }
      }
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
        }
      }
    );
  };

  const handleMint = () => {
    if (!address) return;
    const uid = attestationUid || nftStatus?.attestationUid || "";
    if (!uid) {
      toast({ variant: "destructive", title: "Missing attestation", description: "No attestation found. Please complete verification first." });
      return;
    }
    mintNft.mutate(
      { data: { walletAddress: address, attestationUid: uid } },
      {
        onSuccess: () => {
          toast({ title: "NFT Minted!", description: "Your soulbound KIUT token has been issued." });
          queryClient.invalidateQueries({ queryKey: getGetNftStatusQueryKey(address) });
        },
        onError: (err) => {
          toast({ variant: "destructive", title: "Minting failed", description: err.message });
        }
      }
    );
  };

  const stepLabels = ["Connect Wallet", "Sign Message", "Link Kraken", "Mint NFT"];

  return (
    <div className="w-full max-w-xl mx-auto border border-border bg-card rounded-2xl p-6 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${(step / 4) * 100}%` }}
        />
      </div>

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

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
            <ShieldCheck className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-foreground mb-2">Prove Wallet Ownership</h2>
            <p className="text-muted-foreground mb-1 text-sm font-mono">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Sign a message to prove you control this wallet. This is free — no gas required.
            </p>
            <Button
              size="lg"
              className="w-full max-w-sm"
              onClick={handleSign}
              disabled={getSignMessage.isPending || !address}
            >
              {getSignMessage.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Sign Message <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        )}

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

        {step === 4 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
            {isAttesting ? (
              <div className="space-y-4">
                <Loader2 className="w-12 h-12 text-primary mx-auto animate-spin" />
                <h2 className="text-xl font-semibold">Creating Attestation…</h2>
                <p className="text-muted-foreground text-sm">Issuing your EAS attestation on Inkonchain.</p>
              </div>
            ) : nftStatus?.hasMinted ? (
              <div className="space-y-6">
                <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
                <h2 className="text-3xl font-semibold text-foreground">Verified Human</h2>
                <div className="inline-block border border-primary/30 bg-primary/10 rounded-full px-4 py-1 text-primary text-sm font-medium">
                  Kraken Verified · Soulbound
                </div>
                <img
                  src="/kiut-badge.jpeg"
                  alt="KIUT Badge"
                  className="w-32 h-32 rounded-lg mx-auto shadow-[0_0_40px_rgba(147,51,234,0.4)]"
                />
                <p className="text-muted-foreground text-xs font-mono">{address}</p>
                {nftStatus.explorerUrl && (
                  <a
                    href={nftStatus.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline block text-sm"
                  >
                    View on Inkonchain Explorer →
                  </a>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <Zap className="w-12 h-12 text-primary mx-auto" />
                <h2 className="text-2xl font-semibold text-foreground">Ready to Mint</h2>
                <div className="text-sm text-muted-foreground space-y-1 bg-muted/40 rounded-lg p-4 text-left max-w-sm mx-auto">
                  <p>Wallet: <span className="font-mono text-foreground">{address?.slice(0, 6)}...{address?.slice(-4)}</span></p>
                  <p>Attestation: <span className="font-mono text-foreground">{(attestationUid || nftStatus?.attestationUid || "").slice(0, 10)}…</span></p>
                  <p>Chain: <span className="text-foreground">Inkonchain (57073)</span></p>
                  <p>Type: <span className="text-foreground">Soulbound · Non-transferable</span></p>
                </div>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  Your identity is verified. Mint your soulbound KIUT NFT to finalize.
                </p>
                <Button
                  size="lg"
                  className="w-full max-w-sm bg-primary hover:bg-primary/90 text-white shadow-[0_0_20px_rgba(147,51,234,0.3)]"
                  onClick={handleMint}
                  disabled={mintNft.isPending || !attestationUid && !nftStatus?.attestationUid}
                >
                  {mintNft.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Mint KIUT NFT
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
