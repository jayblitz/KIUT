import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { wagmiConfig } from "@/lib/web3";
import { ThemeProvider, useTheme } from "@/lib/theme";

const queryClient = new QueryClient();

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ThemedApp() {
  const { theme } = useTheme();
  const rkTheme = theme === "dark"
    ? darkTheme({ accentColor: "#9333ea", accentColorForeground: "white", borderRadius: "medium" })
    : lightTheme({ accentColor: "#7c3aed", accentColorForeground: "white", borderRadius: "medium" });

  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider theme={rkTheme}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRoutes />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </RainbowKitProvider>
    </WagmiProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
