import { useCallback } from "react";
import { AdminGate } from "./AdminApp";
export function TestAuthShim() {
  const getToken = useCallback(async () => "tyt-admin-test-auth", []);
  return <AdminGate identity={{ loaded: true, signedIn: true, getToken, signOut: async () => {} }} />;
}
