// GRIDA-SEC-010 — public DTOs and safe errors only; terminal control text is escaped.
/** Result serialization and terminal escaping; callers supply only safe public DTOs. */
export class Output {
  constructor(
    readonly json: boolean,
    private readonly stdout: (value: string) => void,
    private readonly stderr: (value: string) => void
  ) {}

  result(value: unknown, lines: readonly string[]) {
    this.stdout(
      this.json
        ? JSON.stringify(value) + "\n"
        : lines.map(Output.text).join("\n") + "\n"
    );
  }

  failure(error: Output.Failure) {
    if (this.json) this.stdout(JSON.stringify({ error }) + "\n");
    else {
      this.stderr(`grida: ${Output.text(error.message)} (${error.code})\n`);
      for (const choice of error.choices ?? [])
        this.stderr(`  ${Output.text(choice.name)} (ID ${choice.id})\n`);
      if (error.choices_truncated)
        this.stderr(
          "  More organizations are available; run grida account view.\n"
        );
    }
  }

  static text(value: string): string {
    // Account-controlled text cannot issue terminal escape sequences or new lines.
    return value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "�");
  }

  static usd(cents: number): string {
    const amount = BigInt(cents);
    const absolute = amount < 0n ? -amount : amount;
    return `${amount < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")} USD`;
  }
}

export namespace Output {
  export type Failure = {
    code: string;
    message: string;
    choices?: readonly { id: number; name: string; display_name: string }[];
    choices_truncated?: boolean;
  };
}
