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
export function useFigmaAccessToken() {
  const personalAccessToken = personal.get_safe();
  const [fat, setFat] = useState<string>(null);
  const router = useRouter();

  useEffect(() => {
    setFat(router.query.fat as string); // undefined is a valid input.
  }, [router]);

  return { accessToken: fat, personalAccessToken: personalAccessToken };
}
