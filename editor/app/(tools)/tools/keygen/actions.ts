"use server";

import { generateKeyPair } from "crypto";
import { promisify } from "util";

export type KeypairAlgorithm = "ES256" | "RS256";

const generateKeyPairAsync = promisify(generateKeyPair);

export async function generateKeypairAction(algorithm: KeypairAlgorithm) {
  if (algorithm !== "ES256" && algorithm !== "RS256") {
    throw new Error("Unsupported algorithm.");
  }

  if (algorithm === "ES256") {
    const { publicKey, privateKey } = (await generateKeyPairAsync("ec", {
      namedCurve: "P-256",
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    })) as { publicKey: string; privateKey: string };

    return { publicKeyPem: publicKey, privateKeyPem: privateKey };
  }

  const { publicKey, privateKey } = (await generateKeyPairAsync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  })) as { publicKey: string; privateKey: string };

  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}
