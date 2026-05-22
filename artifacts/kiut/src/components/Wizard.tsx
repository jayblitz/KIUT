import { useState, useEffect } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useGetSignMessage, useStartKrakenAuth, useCreateAttestation, useMintKiutNft, useGetNftStatus, getGetNftStatusQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, ArrowRight, ShieldCheck, Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

type Step = 1 | 2 | 3 | 4;

export default function Wizard() {
  const { address, isConnected } = useAccount();
  const [step, setStep] = useState<Step>(1);
  const [nonce, setNonce] = useState("");
  const [signature, setSignature] = useState("");
  const [attestationUid, setAttestationUid] = useState("");
  
  const { toast } = useToast();
  const [location] = useLocation();
  const queryClient = useQueryClient();

  const { data: nftStatus, isLoading: isLoadingStatus } = useGetNftStatus(address || "", {
    query: {
      enabled: !!address,
      queryKey: getGetNftStatusQueryKey(address || "")
    }
  });

  const getSignMessage = useGetSignMessage();
  const signMessage = useSignMessage();
  const startKrakenAuth = useStartKrakenAuth();
  const createAttestation = useCreateAttestation();
  const mintNft = useMintKiutNft();

  useEffect(() => {
    if (isConnected && step === 1 && !nftStatus?.hasMinted) {
      setStep(2);
    }
  }, [isConnected, step, nftStatus]);

  useEffect(() => {
    if (nftStatus?.hasMinted) {
      setStep(4);
    }
  }, [nftStatus]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("krakenLinked") === "true") {
      setStep(4);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleSign = () => {
    if (!address) return;
    getSignMessage.mutate({ data: { walletAddress: address } }, {
      onSuccess: (data) => {
        setNonce(data.nonce);
        signMessage.signMessage({ message: data.message }, {
          onSuccess: (sig) => {
            setSignature(sig);
            setStep(3);
          },
          onError: (err) => {
            toast({ variant: "destructive", title: "Signing failed", description: err.message });
          }
        });
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Failed to get message", description: err.message });
      }
    });
  };

  const handleConnectKraken = () => {
    if (!address || !signature || !nonce) return;
    startKrakenAuth.mutate({ data: { walletAddress: address, signature, nonce } }, {
      onSuccess: (data) => {
        window.location.href = data.authUrl;
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Failed to start Kraken auth", description: err.message });
      }
    });
  };

  const handleMint = () => {
    if (!address) return;
    const uid = attestationUid || nftStatus?.attestationUid || "dummy-uid-if-backend-didnt-provide";
    mintNft.mutate({ data: { walletAddress: address, attestationUid: uid } }, {
      onSuccess: (data) => {
        toast({ title: "NFT Minted!", description: "Your soulbound token has been issued." });
        queryClient.invalidateQueries({ queryKey: getGetNftStatusQueryKey(address) });
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Minting failed", description: err.message });
      }
    });
  };

  return (
    <div className="w-full max-w-xl mx-auto border border-border bg-card rounded-2xl p-6 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-muted">
        <div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: `${(step / 4) * 100}%` }} />
      </div>

      <div className="flex gap-4 mb-8 text-sm font-medium">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`flex-1 text-center py-2 border-b-2 transition-colors ${step >= s ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>
            Step {s}
          </div>
        ))}
      </div>

      <div className="min-h-[300px] flex flex-col items-center justify-center text-center space-y-6">
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Lock className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-foreground mb-2">Connect Your Wallet</h2>
            <p className="text-muted-foreground mb-8 max-w-md">Connect your Web3 wallet to start the verification process. This wallet will hold your soulbound NFT.</p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
            <ShieldCheck className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-foreground mb-2">Verify Wallet Ownership</h2>
            <p className="text-muted-foreground mb-2">Wallet: {address?.slice(0,6)}...{address?.slice(-4)}</p>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">Sign a message to prove you own this wallet. This action does not cost gas.</p>
            
            <Button 
              size="lg" 
              className="w-full max-w-sm" 
              onClick={handleSign}
              disabled={getSignMessage.isPending || signMessage.isPending}
            >
              {(getSignMessage.isPending || signMessage.isPending) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sign Message <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
            <svg viewBox="0 0 24 24" className="w-12 h-12 text-primary mx-auto mb-4" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
            </svg>
            <h2 className="text-2xl font-semibold text-foreground mb-2">Connect Kraken Account</h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">Link your verified Kraken account to establish your onchain identity.</p>
            
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
            {nftStatus?.hasMinted ? (
              <div className="space-y-6">
                <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
                <h2 className="text-3xl font-semibold text-foreground">Verified Human</h2>
                <div className="inline-block border border-primary/30 bg-primary/10 rounded-full px-4 py-1 text-primary text-sm font-medium mb-4">
                  Kraken Verified
                </div>
                <img src="/kiut-badge.jpeg" alt="KIUT Badge" className="w-32 h-32 rounded-lg mx-auto shadow-[0_0_40px_rgba(147,51,234,0.4)]" />
                <p className="text-muted-foreground text-sm">Wallet: {address}</p>
                {nftStatus.explorerUrl && (
                  <a href={nftStatus.explorerUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline block mt-4">
                    View on Explorer
                  </a>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <img src="/kiut-badge.jpeg" alt="KIUT Badge" className="w-32 h-32 rounded-lg mx-auto opacity-70 grayscale transition-all duration-700" />
                <h2 className="text-2xl font-semibold text-foreground mb-2">Ready to Mint</h2>
                <p className="text-muted-foreground mb-8 max-w-md mx-auto">Your identity is verified. Mint your soulbound KIUT NFT to finalize.</p>
                
                <Button 
                  size="lg" 
                  className="w-full max-w-sm bg-primary hover:bg-primary/90 text-white" 
                  onClick={handleMint}
                  disabled={mintNft.isPending}
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
