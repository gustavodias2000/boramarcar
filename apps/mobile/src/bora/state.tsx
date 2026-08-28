import type { Session, User } from "@supabase/supabase-js";
import React, { createContext, useContext, useState, type ReactNode } from "react";

import type { BusinessContext } from "../v1/domain";

interface BoraState {
  readonly session: Session | null;
  readonly user: User | null;
  readonly activeContext: BusinessContext | null;
  setActiveContext: (context: BusinessContext | null) => void;
}

const Context = createContext<BoraState | null>(null);

export function BoraStateProvider({ session, children }: { readonly session: Session | null; readonly children: ReactNode }) {
  const [activeContext, setActiveContext] = useState<BusinessContext | null>(null);
  return <Context.Provider value={{ session, user: session?.user ?? null, activeContext, setActiveContext }}>{children}</Context.Provider>;
}

export function useBoraState(): BoraState {
  const value = useContext(Context);
  if (!value) throw new Error("useBoraState precisa estar dentro de BoraStateProvider.");
  return value;
}
