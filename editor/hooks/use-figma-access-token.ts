import { useRouter } from "next/router";
import { useEffect, useState } from "react";

/**
 * retrieves figma access token (fat) from query param.
 * @returns
 */
export function useFigmaAccessToken() {
  const [fat, setFat] = useState<string>(null);
  const router = useRouter();

  useEffect(() => {
    setFat(router.query.fat as string); // undefined is a valid input.
  }, [router]);

  return fat;
}
