import { createContext, useContext } from "react";

type SSEContextValue = { isConnected: boolean };

export const SSEContext = createContext<SSEContextValue>({
  isConnected: false,
});

export function useSSEConnection(): SSEContextValue {
  return useContext(SSEContext);
}
