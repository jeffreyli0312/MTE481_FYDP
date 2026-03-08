import React, { createContext, useContext, useState, useMemo } from "react";

type DevModeContextType = {
  devMode: boolean;
  toggleDevMode: () => void;
};

const DevModeContext = createContext<DevModeContextType>({
  devMode: false,
  toggleDevMode: () => {},
});

export function DevModeProvider({ children }: { children: React.ReactNode }) {
  const [devMode, setDevMode] = useState(false);

  const value = useMemo(
    () => ({
      devMode,
      toggleDevMode: () => setDevMode((prev) => !prev),
    }),
    [devMode],
  );

  return (
    <DevModeContext.Provider value={value}>{children}</DevModeContext.Provider>
  );
}

export function useDevMode() {
  return useContext(DevModeContext);
}
