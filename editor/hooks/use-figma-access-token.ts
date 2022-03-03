import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { personal } from "@design-sdk/figma-auth-store";

/**
 * retrieves figma access token (fat) from query param.
 * while using this as a dependency, you should use the fat.accessToken, not the entire object.
 *
 * e.g.
 * ```
 * const fat = useFigmaAccessToken();
 * useEffect(() => {}, [fat.accessToken]);
 * ```
 * @returns
 */
export function useFigmaAccessToken(): {
  accessToken: { token?: string; loading: boolean; verified: boolean };
  personalAccessToken: string;
} {
  const personalAccessToken = personal.get_safe();
  const [fat, setFat] = useState<string>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();

  useEffect(() => {
    setFat(router.query.fat as string); // undefined is a valid input.
    if (router.query.fat) {
      setLoading(false);
    }
  }, [router.query]);

  useEffect(() => {
    setTimeout(() => {
      // assume router query loading is complete after this timeout
      setLoading(false);
    }, 50);
  }, [router]);

  if (personalAccessToken) {
    return {
      accessToken: {
        token: fat,
        loading: loading,
        verified: false,
      },
      personalAccessToken,
    };
  }

  return {
    accessToken: {
      token: fat,
      loading: loading,
      verified: false,
    },
    personalAccessToken: personalAccessToken,
  };
}
