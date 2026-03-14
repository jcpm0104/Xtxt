import { useState, useEffect } from "react";

export type TradingAccount = {
  id: string;
  platform: "Tradovate" | "NinjaTrader" | "Rithmic";
  mode: "demo" | "live";
  accountName: string;
  accountId?: string | number;
  accountSize: number;

  riskPerTrade: number;
  dailyLossLimit: number;
  maxDrawdown: number;
  maxTradesPerDay: number;

  isConnected: boolean;
};

const STORAGE_KEY = "trade_guardian_accounts";
const ACTIVE_KEY = "trade_guardian_active_account";

export function useAccounts() {
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

  // Load accounts from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const active = localStorage.getItem(ACTIVE_KEY);

    if (saved) {
      setAccounts(JSON.parse(saved));
    }

    if (active) {
      setActiveAccountId(active);
    }
  }, []);

  // Save accounts
  const saveAccounts = (newAccounts: TradingAccount[]) => {
    setAccounts(newAccounts);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newAccounts));
  };

  // Add new account
  const addAccount = (account: TradingAccount) => {
    const updated = [...accounts, account];
    saveAccounts(updated);
  };

  // Switch account
  const switchAccount = (id: string) => {
    setActiveAccountId(id);
    localStorage.setItem(ACTIVE_KEY, id);
  };

  // Update settings
  const updateAccount = (id: string, data: Partial<TradingAccount>) => {
    const updated = accounts.map((acc) =>
      acc.id === id ? { ...acc, ...data } : acc
    );

    saveAccounts(updated);
  };

  const activeAccount = accounts.find((a) => a.id === activeAccountId) || null;

  return {
    accounts,
    activeAccount,
    activeAccountId,
    addAccount,
    switchAccount,
    updateAccount
  };
}
