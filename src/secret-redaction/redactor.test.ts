import { describe, it, expect, beforeEach } from "vitest";
import {
  redact,
  registerSecret,
  captureSecretsFromCommand,
  captureSecretsFromFileRead,
  _resetRegistry,
} from "./redactor.js";

describe("secret redaction", () => {
  beforeEach(() => _resetRegistry());

  describe("registered exact values", () => {
    it("masks a registered secret anywhere it appears", () => {
      registerSecret("qnt6AYA1edh6dkx_fen");
      const out = redact("the password is qnt6AYA1edh6dkx_fen ok");
      expect(out).not.toContain("qnt6AYA1edh6dkx_fen");
      expect(out).toContain("[REDACTED]");
    });

    it("ignores short values to avoid false positives", () => {
      registerSecret("abc");
      expect(redact("abc def")).toBe("abc def");
    });

    it("masks multiple occurrences", () => {
      registerSecret("h7xyf11dHoWM1xAamCsw");
      const out = redact("h7xyf11dHoWM1xAamCsw and again h7xyf11dHoWM1xAamCsw");
      expect(out).toBe("[REDACTED] and again [REDACTED]");
    });
  });

  describe("pattern-based masking", () => {
    it("masks X-Plex-Token in a URL", () => {
      const out = redact("http://x:32400/lib?X-Plex-Token=h7xyf11dHoWM1xAamCsw&y=1");
      expect(out).not.toContain("h7xyf11dHoWM1xAamCsw");
      expect(out).toContain("X-Plex-Token=[REDACTED]");
    });

    it("masks PlexOnlineToken attribute", () => {
      const out = redact('<Pref PlexOnlineToken="h7xyf11dHoWM1xAamCsw" />');
      expect(out).toBe('<Pref PlexOnlineToken="[REDACTED]" />');
    });

    it("masks password= assignments", () => {
      const out = redact("NAVIDROME_PASS=qnt6AYA1edh6dkx_fen");
      expect(out).toContain("NAVIDROME_PASS=[REDACTED]");
      expect(out).not.toContain("qnt6");
    });

    it("masks Authorization bearer headers", () => {
      const out = redact("Authorization: Bearer abcdef123456ghijkl");
      expect(out).toBe("Authorization: Bearer [REDACTED]");
    });

    it("masks PEM private key blocks", () => {
      const pem =
        "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\ndef\n-----END OPENSSH PRIVATE KEY-----";
      expect(redact(pem)).toBe("[REDACTED]");
    });

    it("leaves ordinary text untouched", () => {
      const text = "the token is stored in Preferences.xml on jerry";
      expect(redact(text)).toBe(text);
    });
  });

  describe("capture from command output", () => {
    it("registers op read output", () => {
      captureSecretsFromCommand("op read 'op://Private/navidrome/password'", "qnt6AYA1edh6dkx_fen\n");
      expect(redact("value: qnt6AYA1edh6dkx_fen")).toContain("[REDACTED]");
    });

    it("registers agenix -d env values", () => {
      captureSecretsFromCommand(
        "agenix -d auralPlexSyncEnv.age",
        "NAVIDROME_USER=twhitney\nNAVIDROME_PASS=qnt6AYA1edh6dkx_fen\n",
      );
      // The password value is captured; later appearing bare it is masked.
      expect(redact("leaked qnt6AYA1edh6dkx_fen")).toContain("[REDACTED]");
    });

    it("does not capture from unrelated commands", () => {
      captureSecretsFromCommand("ls -la", "somefile.txt\nqnt6AYA1edh6dkx_fen\n");
      // 'ls' is not a secret source and output has no KEY=value; nothing registered.
      expect(redact("qnt6AYA1edh6dkx_fen")).toBe("qnt6AYA1edh6dkx_fen");
    });
  });

  describe("capture from file reads", () => {
    it("registers content of a token file", () => {
      captureSecretsFromFileRead("/tmp/plex_token", "h7xyf11dHoWM1xAamCsw\n");
      expect(redact("token h7xyf11dHoWM1xAamCsw")).toContain("[REDACTED]");
    });

    it("ignores non-secret file paths", () => {
      captureSecretsFromFileRead("/tmp/notes.txt", "h7xyf11dHoWM1xAamCsw\n");
      expect(redact("h7xyf11dHoWM1xAamCsw")).toBe("h7xyf11dHoWM1xAamCsw");
    });
  });
});
