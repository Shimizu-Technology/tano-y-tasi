import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { AdminGate } from "./AdminApp";
export function TestAuthShim() {
  const location = useLocation();
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(
    () => new URLSearchParams(location.search).get("mockAuth") !== "signed-out"
  );
  const getToken = useCallback(async () => "tyt-admin-test-auth", []);
  return (
    <AdminGate
      identity={{
        loaded: true,
        signedIn,
        email: "admin@example.com",
        getToken,
        signOut: async (options) => {
          setSignedIn(false);
          if (options?.redirectUrl) navigate(options.redirectUrl, { replace: true });
        },
      }}
    />
  );
}
